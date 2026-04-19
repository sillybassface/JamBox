from fastapi import APIRouter, HTTPException, Depends
from fastapi import Request, Body, Query
from app.database import get_db
from app.models import SongOut, SongCreate, AddSongResponse, UserOut
from app.songs import repository
from app.songs.service import add_song
from app.tasks import repository as task_repo
from app.auth.dependencies import get_optional_user, require_admin
from app.config import settings
from app.audio.lyrics_alignment import align_lyrics, _whisper_only
import shutil
import uuid
import re
import json
import asyncio

router = APIRouter(prefix="/api/songs", tags=["songs"])

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def _validate_song_id(song_id: str) -> None:
    if not UUID_PATTERN.match(song_id):
        raise HTTPException(status_code=400, detail="Invalid song ID format")


@router.get("", response_model=list[SongOut])
async def list_songs(user: UserOut | None = Depends(get_optional_user)):
    db = await get_db()
    return await repository.get_songs(db, user_id=user.id if user else None)


@router.get("/{song_id}", response_model=SongOut)
async def get_song(song_id: str, user: UserOut | None = Depends(get_optional_user)):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id, user_id=user.id if user else None)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Attach stem list
    stems_dir = settings.songs_dir / song_id / "stems"
    if stems_dir.exists():
        song.stems = sorted([f.stem for f in stems_dir.glob("*.mp3")])
    return song


@router.post("", response_model=AddSongResponse, status_code=202)
async def create_song(
    body: SongCreate, user: UserOut | None = Depends(get_optional_user)
):
    try:
        return await add_song(body.youtube_url, user_id=user.id if user else None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{song_id}", status_code=204)
async def delete_song(song_id: str, user: UserOut = Depends(require_admin)):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    await repository.delete_song(db, song_id)
    # Clean up files
    song_dir = settings.songs_dir / song_id
    if song_dir.exists():
        shutil.rmtree(song_dir)


@router.get("/{song_id}/lyrics")
async def get_lyrics(song_id: str):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    lyrics = await repository.get_lyrics(db, song_id)

    active_task = await task_repo.get_task_by_song_and_step(db, song_id, "lyrics")
    response = {"lyrics": lyrics}
    if active_task and active_task.status == "running":
        response["task_status"] = "running"
        response["task_step"] = active_task.step
        response["task_progress"] = active_task.progress
    elif active_task and active_task.status == "failed":
        response["task_status"] = "failed"
        response["error"] = active_task.error
    return response


@router.delete("/{song_id}/lyrics")
async def delete_lyrics(song_id: str):
    """Delete lyrics for a song."""
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    await repository.update_lyrics(db, song_id, None)
    song_dir = settings.songs_dir / song_id
    lyrics_path = song_dir / "lyrics.json"
    if lyrics_path.exists():
        lyrics_path.unlink()
    return {"status": "deleted"}


@router.post("/{song_id}/lyrics")
async def process_lyrics(song_id: str, language: str = Query("vi")):
    """Generate lyrics with optional language selection.

    Args:
        language: "vi" for Vietnamese, "en" for English (default: "vi")
    """
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Check for existing lyrics task
    existing_task = await task_repo.get_task_by_song_and_step(db, song_id, "lyrics")
    if existing_task:
        if existing_task.status == "running":
            return {"task_id": existing_task.id, "status": "processing"}

    # Create new task
    task_id = str(uuid.uuid4())
    await task_repo.create_task(db, task_id, song_id, "lyrics")

    # Start async processing in background via worker
    asyncio.create_task(_process_lyrics_task(task_id, song_id, language))

    return {"task_id": task_id, "status": "processing"}


async def _process_lyrics_task(task_id: str, song_id: str, language: str = "vi"):
    """Process lyrics via task system with progress updates."""
    import logging
    from app.audio.lyrics_detection import save_lyrics_sync
    from app.tasks import pubsub

    logger = logging.getLogger(__name__)
    song_dir = settings.songs_dir / song_id
    db = await get_db()

    song = await repository.get_song(db, song_id)
    if not song:
        logger.warning(f"Song {song_id} not found for lyrics processing")
        return

    title = song.title
    artist = song.artist

    async def progress(step: str, pct: float, msg: str):
        await task_repo.update_task(
            db, task_id, status="running", step=step, progress=pct
        )
        await pubsub.publish(
            task_id,
            {
                "task_id": task_id,
                "status": "running",
                "step": step,
                "progress": pct,
                "message": msg,
            },
        )

    try:
        await task_repo.update_task(
            db, task_id, status="running", step="transcribing", progress=0
        )
        await pubsub.publish(
            task_id,
            {
                "task_id": task_id,
                "status": "running",
                "step": "transcribing",
                "progress": 0,
                "message": "Starting...",
            },
        )
        logger.info(f"Starting Whisper for song {song_id}")

        success = await asyncio.get_event_loop().run_in_executor(
            None, save_lyrics_sync, song_dir, title, artist, song.youtube_url, language
        )

        logger.info(f"Whisper done, success={success}")
        
        if success:
            lyrics_path = song_dir / "lyrics.json"
            logger.info(f"Lyrics path exists: {lyrics_path.exists()}, path: {lyrics_path}")
            if lyrics_path.exists():
                lyrics = json.loads(lyrics_path.read_text())
                logger.info(f"Got lyrics from file: {len(lyrics.get('words', []))} words")
                await db.execute(
                    "UPDATE songs SET lyrics = ?, updated_at = datetime('now') WHERE id = ?",
                    (json.dumps(lyrics), song_id),
                )
                await db.commit()
                logger.info(f"Committed lyrics to DB")

                await task_repo.update_task(
                    db, task_id, status="completed", step="done", progress=1.0
                )
                await pubsub.publish(
                    task_id,
                    {
                        "task_id": task_id,
                        "status": "completed",
                        "step": "done",
                        "progress": 1.0,
                    },
                )
                logger.info(f"Lyrics processed for song {song_id}, {len(lyrics.get('words', []))} words")
        else:
            err = "Whisper failed to detect lyrics"
            await task_repo.update_task(
                db, task_id, status="failed", step="error", progress=0, error=err
            )
            await pubsub.publish(
                task_id, {"task_id": task_id, "status": "failed", "error": err}
            )
            logger.warning(f"Lyrics detection failed for song {song_id}")

    except Exception as e:
        err = str(e)[:500]
        await task_repo.update_task(
            db, task_id, status="failed", step="error", progress=0, error=err
        )
        await pubsub.publish(
            task_id, {"task_id": task_id, "status": "failed", "error": err}
        )
        logger.exception(f"Lyrics processing error for song {song_id}: {e}")


@router.put("/{song_id}/lyrics")
async def set_custom_lyrics(
    song_id: str,
    lyrics_text: str = Body(..., embed=True),
    regenerate: bool = Body(False),
):
    """Set custom lyrics text for a song."""
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    import logging

    logger = logging.getLogger(__name__)
    logger.info(f"Setting custom lyrics for song {song_id}, regenerate={regenerate}")

    if regenerate:
        from app.audio.lyrics_detection import save_lyrics_sync
        from app.tasks import pubsub as ps

        task_id = str(uuid.uuid4())
        await task_repo.create_task(db, task_id, song_id, "lyrics")
        asyncio.create_task(_process_custom_lyrics_task(task_id, song_id, lyrics_text))
        return {"task_id": task_id, "status": "processing"}

    song_dir = settings.songs_dir / song_id
    await repository.update_lyrics(
        db,
        song_id,
        {"words": [], "source": "custom", "custom_text": lyrics_text},
    )
    return {"lyrics": lyrics_text, "status": "saved"}


async def _process_custom_lyrics_task(task_id: str, song_id: str, lyrics_text: str):
    """Process custom lyrics with Whisper timestamps."""
    import logging
    from app.audio.lyrics_detection import _run_whisper, save_lyrics_sync
    from app.audio.lyrics_fetch import _parse_vtt_file
    from app.tasks import pubsub

    logger = logging.getLogger(__name__)
    song_dir = settings.songs_dir / song_id
    db = await get_db()

    try:
        await task_repo.update_task(
            db, task_id, status="running", step="transcribing", progress=0
        )
        await pubsub.publish(
            task_id,
            {
                "task_id": task_id,
                "status": "running",
                "step": "transcribing",
                "progress": 0,
                "message": "Getting timestamps...",
            },
        )

        whisper_words = await asyncio.get_event_loop().run_in_executor(
            None, _run_whisper, song_dir
        )

        if not whisper_words:
            whisper_words = []

        if lyrics_text and whisper_words:
            final_words = align_lyrics(lyrics_text, whisper_words)
        elif lyrics_text:
            final_words = _whisper_only_from_text(lyrics_text)
        else:
            final_words = []

        lyrics_data = {
            "words": final_words,
            "source": "custom",
            "custom_text": lyrics_text,
        }

        await repository.update_lyrics(db, song_id, lyrics_data)
        await task_repo.update_task(
            db, task_id, status="completed", step="done", progress=1.0
        )
        await pubsub.publish(
            task_id,
            {
                "task_id": task_id,
                "status": "completed",
                "step": "done",
                "progress": 1.0,
            },
        )
        logger.info(f"Custom lyrics processed for song {song_id}")

    except Exception as e:
        err = str(e)[:500]
        await task_repo.update_task(
            db, task_id, status="failed", step="error", progress=0, error=err
        )
        await pubsub.publish(
            task_id, {"task_id": task_id, "status": "failed", "error": err}
        )


def _whisper_only_from_text(text: str) -> list[dict]:
    """Create word list from plain text with estimated timing."""
    lines = text.split("\n")
    words = []
    current_time = 0.0

    for line in lines:
        for word in line.split():
            word = word.strip()
            if not word:
                continue
            duration = max(0.2, len(word) / 5.0)
            words.append(
                {"word": word, "start": current_time, "end": current_time + duration}
            )
            current_time += duration

    detected = _detect_phrase_boundaries_simple(words)
    return detected


def _detect_phrase_boundaries_simple(words: list[dict]) -> list[dict]:
    """Simple phrase detection from plain text."""
    result = []
    for i, w in enumerate(words):
        word = w.get("word", "")
        is_phrase_start = False

        if i == 0:
            is_phrase_start = True
        elif i > 0 and word and (word[-1] in ".!?"):
            is_phrase_start = True

        result.append({**w, "is_phrase_start": is_phrase_start})

    return result
