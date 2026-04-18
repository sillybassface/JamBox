from fastapi import APIRouter, HTTPException, Depends
from fastapi import Request
from app.database import get_db
from app.models import SongOut, SongCreate, AddSongResponse, UserOut
from app.songs import repository
from app.songs.service import add_song
from app.tasks import repository as task_repo
from app.auth.dependencies import get_optional_user, require_admin
from app.config import settings
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
    return {"lyrics": lyrics}


@router.post("/{song_id}/lyrics")
async def process_lyrics(song_id: str):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Check if lyrics already processed
    existing = await repository.get_lyrics(db, song_id)
    if existing:
        return {"lyrics": existing, "status": "already_processed"}

    # Check for existing lyrics task
    existing_task = await task_repo.get_task_by_song_and_step(db, song_id, "lyrics")
    if existing_task:
        if existing_task.status == "running":
            return {"task_id": existing_task.id, "status": "processing"}
        if existing_task.status == "completed":
            lyrics = await repository.get_lyrics(db, song_id)
            return {"lyrics": lyrics, "status": "already_processed"}

    # Create new task
    task_id = str(uuid.uuid4())
    await task_repo.create_task(db, task_id, song_id, "lyrics")

    # Start async processing in background via worker
    asyncio.create_task(_process_lyrics_task(task_id, song_id))

    return {"task_id": task_id, "status": "processing"}


async def _process_lyrics_task(task_id: str, song_id: str):
    """Process lyrics via task system with progress updates."""
    import logging
    from app.audio.lyrics_detection import save_lyrics
    from app.tasks import pubsub

    logger = logging.getLogger(__name__)
    song_dir = settings.songs_dir / song_id
    db = await get_db()

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

        success = await asyncio.get_event_loop().run_in_executor(
            None, save_lyrics, song_dir
        )

        if success:
            lyrics_path = song_dir / "lyrics.json"
            if lyrics_path.exists():
                lyrics = json.loads(lyrics_path.read_text())
                await repository.update_lyrics(db, song_id, lyrics)

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
                logger.info(f"Lyrics processed for song {song_id}")
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
