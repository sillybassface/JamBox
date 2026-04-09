import re
import uuid
import subprocess
import json
from typing import Optional
from app.database import get_db
from app.songs import repository
from app.tasks import repository as task_repo
from app.tasks.worker import enqueue
from app.models import SongOut, AddSongResponse


YOUTUBE_PATTERNS = [
    r"(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})",
]


def extract_youtube_id(url: str) -> Optional[str]:
    for pattern in YOUTUBE_PATTERNS:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


async def fetch_youtube_metadata(url: str) -> dict:
    """Use yt-dlp to get metadata without downloading."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-playlist", url],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {
                "title": data.get("title", "Unknown Title"),
                "artist": data.get("uploader") or data.get("channel"),
                "duration_secs": data.get("duration"),
                "thumbnail_url": data.get("thumbnail"),
            }
    except Exception:
        pass
    return {"title": "Unknown Title", "artist": None, "duration_secs": None, "thumbnail_url": None}


async def add_song(youtube_url: str, user_id: Optional[str] = None) -> AddSongResponse:
    youtube_id = extract_youtube_id(youtube_url)
    if not youtube_id:
        raise ValueError("Invalid YouTube URL")

    db = await get_db()

    # Check for duplicate
    existing = await repository.get_song_by_youtube_id(db, youtube_id)
    if existing:
        # Return existing song with a new task if it failed, otherwise existing task
        async with db.execute(
            "SELECT * FROM tasks WHERE song_id = ? ORDER BY created_at DESC LIMIT 1",
            (existing.id,)
        ) as cur:
            task_row = await cur.fetchone()
        if task_row:
            return AddSongResponse(song=existing, task_id=task_row["id"])

    # Fetch metadata
    meta = await fetch_youtube_metadata(youtube_url)

    song_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())

    song = await repository.create_song(
        db,
        song_id=song_id,
        youtube_url=youtube_url,
        youtube_id=youtube_id,
        title=meta["title"],
        artist=meta["artist"],
        duration_secs=meta["duration_secs"],
        thumbnail_url=meta["thumbnail_url"],
        added_by=user_id,
    )

    await task_repo.create_task(db, task_id=task_id, song_id=song_id)
    await enqueue(task_id)

    return AddSongResponse(song=song, task_id=task_id)
