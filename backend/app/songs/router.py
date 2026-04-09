from fastapi import APIRouter, HTTPException, Depends
from fastapi import Request
from app.database import get_db
from app.models import SongOut, SongCreate, AddSongResponse, UserOut
from app.songs import repository
from app.songs.service import add_song
from app.auth.dependencies import get_optional_user, require_admin
from app.config import settings
import shutil

router = APIRouter(prefix="/api/songs", tags=["songs"])


@router.get("", response_model=list[SongOut])
async def list_songs(user: UserOut | None = Depends(get_optional_user)):
    db = await get_db()
    return await repository.get_songs(db, user_id=user.id if user else None)


@router.get("/{song_id}", response_model=SongOut)
async def get_song(song_id: str, user: UserOut | None = Depends(get_optional_user)):
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
async def create_song(body: SongCreate, user: UserOut | None = Depends(get_optional_user)):
    try:
        return await add_song(body.youtube_url, user_id=user.id if user else None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{song_id}", status_code=204)
async def delete_song(song_id: str, user: UserOut = Depends(require_admin)):
    db = await get_db()
    song = await repository.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    await repository.delete_song(db, song_id)
    # Clean up files
    song_dir = settings.songs_dir / song_id
    if song_dir.exists():
        shutil.rmtree(song_dir)
