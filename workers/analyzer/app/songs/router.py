from fastapi import APIRouter, HTTPException, Depends
from fastapi import Request, Body, Query
from app.database import get_db
from app.models import SongOut, SongCreate, AddSongResponse, UserOut
from app.songs import repository
from app.songs.service import add_song
from app.tasks import repository as task_repo
from app.tasks.worker import enqueue_transcription, enqueue_custom_transcription
from app.auth.dependencies import get_optional_user, require_admin
from app.config import settings
import shutil
import uuid
import re
import json

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
    elif active_task and active_task.status == "completed":
        response["task_status"] = "completed"
        response["task_step"] = active_task.step
        response["task_progress"] = active_task.progress
    return response


@router.delete("/{song_id}/lyrics")
async def delete_lyrics(song_id: str):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    await repository.update_lyrics(db, song_id, None)
    lyrics_path = settings.songs_dir / song_id / "lyrics.json"
    if lyrics_path.exists():
        lyrics_path.unlink()
    return {"status": "deleted"}


@router.post("/{song_id}/lyrics")
async def process_lyrics(song_id: str, language: str = Query("vi")):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    existing_task = await task_repo.get_task_by_song_and_step(db, song_id, "lyrics")
    if existing_task and existing_task.status == "running":
        return {"task_id": existing_task.id, "status": "processing"}

    task_id = str(uuid.uuid4())
    await task_repo.create_task(db, task_id, song_id, "lyrics")
    await enqueue_transcription(task_id, song_id, language)
    return {"task_id": task_id, "status": "processing"}


@router.put("/{song_id}/lyrics")
async def set_custom_lyrics(
    song_id: str,
    lyrics_text: str = Body(..., embed=True),
    regenerate: bool = Body(False),
):
    _validate_song_id(song_id)
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if regenerate:
        task_id = str(uuid.uuid4())
        await task_repo.create_task(db, task_id, song_id, "lyrics")
        await enqueue_custom_transcription(task_id, song_id, lyrics_text)
        return {"task_id": task_id, "status": "processing"}

    await repository.update_lyrics(
        db,
        song_id,
        {"words": [], "source": "custom", "custom_text": lyrics_text},
    )
    return {"lyrics": lyrics_text, "status": "saved"}
