import aiosqlite
from typing import Optional
from app.models import SongOut


def _row_to_song(row: aiosqlite.Row, is_favourite: bool = False, stems: list[str] = []) -> SongOut:
    return SongOut(
        id=row["id"],
        youtube_url=row["youtube_url"],
        youtube_id=row["youtube_id"],
        title=row["title"],
        artist=row["artist"],
        duration_secs=row["duration_secs"],
        thumbnail_url=row["thumbnail_url"],
        status=row["status"],
        error_message=row["error_message"],
        added_by=row["added_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        is_favourite=is_favourite,
        stems=stems,
    )


async def get_songs(db: aiosqlite.Connection, user_id: Optional[str] = None) -> list[SongOut]:
    async with db.execute(
        "SELECT * FROM songs ORDER BY created_at DESC"
    ) as cur:
        rows = await cur.fetchall()

    fav_set: set[str] = set()
    if user_id:
        async with db.execute(
            "SELECT song_id FROM favourites WHERE user_id = ?", (user_id,)
        ) as cur:
            fav_rows = await cur.fetchall()
            fav_set = {r["song_id"] for r in fav_rows}

    return [_row_to_song(r, r["id"] in fav_set) for r in rows]


async def get_song(db: aiosqlite.Connection, song_id: str, user_id: Optional[str] = None) -> Optional[SongOut]:
    async with db.execute("SELECT * FROM songs WHERE id = ?", (song_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    is_fav = False
    if user_id:
        async with db.execute(
            "SELECT 1 FROM favourites WHERE user_id = ? AND song_id = ?", (user_id, song_id)
        ) as cur:
            is_fav = bool(await cur.fetchone())
    return _row_to_song(row, is_fav)


async def get_song_by_youtube_id(db: aiosqlite.Connection, youtube_id: str) -> Optional[SongOut]:
    async with db.execute("SELECT * FROM songs WHERE youtube_id = ?", (youtube_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return _row_to_song(row)


async def create_song(
    db: aiosqlite.Connection,
    song_id: str,
    youtube_url: str,
    youtube_id: str,
    title: str,
    artist: Optional[str],
    duration_secs: Optional[float],
    thumbnail_url: Optional[str],
    added_by: Optional[str],
) -> SongOut:
    await db.execute(
        """INSERT INTO songs (id, youtube_url, youtube_id, title, artist, duration_secs, thumbnail_url, added_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (song_id, youtube_url, youtube_id, title, artist, duration_secs, thumbnail_url, added_by),
    )
    await db.commit()
    song = await get_song(db, song_id)
    return song


async def update_song_status(db: aiosqlite.Connection, song_id: str, status: str, error: Optional[str] = None):
    await db.execute(
        "UPDATE songs SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?",
        (status, error, song_id),
    )
    await db.commit()


async def delete_song(db: aiosqlite.Connection, song_id: str):
    await db.execute("DELETE FROM songs WHERE id = ?", (song_id,))
    await db.commit()
