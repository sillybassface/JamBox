import aiosqlite
from pathlib import Path
from app.config import settings

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        settings.songs_dir.mkdir(parents=True, exist_ok=True)
        _db = await aiosqlite.connect(str(settings.db_path))
        _db.row_factory = aiosqlite.Row
        await _db.execute("PRAGMA journal_mode=WAL")
        await _db.execute("PRAGMA foreign_keys=ON")
    return _db


async def close_db():
    global _db
    if _db:
        await _db.close()
        _db = None


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS songs (
    id            TEXT PRIMARY KEY,
    youtube_url   TEXT NOT NULL,
    youtube_id    TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_secs REAL,
    thumbnail_url TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    added_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favourites (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id    TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, song_id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    song_id      TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'queued',
    step         TEXT,
    progress     REAL DEFAULT 0,
    error        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def init_db():
    db = await get_db()
    await db.executescript(SCHEMA)
    await db.commit()
