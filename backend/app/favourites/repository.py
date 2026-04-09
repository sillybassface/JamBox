import aiosqlite
from app.models import SongOut
from app.songs.repository import _row_to_song


async def get_favourites(db: aiosqlite.Connection, user_id: str) -> list[SongOut]:
    async with db.execute(
        """SELECT s.* FROM songs s
           JOIN favourites f ON f.song_id = s.id
           WHERE f.user_id = ?
           ORDER BY f.created_at DESC""",
        (user_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [_row_to_song(r, is_favourite=True) for r in rows]


async def add_favourite(db: aiosqlite.Connection, user_id: str, song_id: str):
    await db.execute(
        "INSERT OR IGNORE INTO favourites (user_id, song_id) VALUES (?, ?)",
        (user_id, song_id),
    )
    await db.commit()


async def remove_favourite(db: aiosqlite.Connection, user_id: str, song_id: str):
    await db.execute(
        "DELETE FROM favourites WHERE user_id = ? AND song_id = ?",
        (user_id, song_id),
    )
    await db.commit()
