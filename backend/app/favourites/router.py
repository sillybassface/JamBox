from fastapi import APIRouter, HTTPException, Depends
from app.database import get_db
from app.models import SongOut, UserOut
from app.favourites import repository
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/favourites", tags=["favourites"])


@router.get("", response_model=list[SongOut])
async def list_favourites(user: UserOut = Depends(get_current_user)):
    db = await get_db()
    return await repository.get_favourites(db, user.id)


@router.put("/{song_id}", status_code=204)
async def add_favourite(song_id: str, user: UserOut = Depends(get_current_user)):
    db = await get_db()
    await repository.add_favourite(db, user.id, song_id)


@router.delete("/{song_id}", status_code=204)
async def remove_favourite(song_id: str, user: UserOut = Depends(get_current_user)):
    db = await get_db()
    await repository.remove_favourite(db, user.id, song_id)
