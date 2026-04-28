#!/usr/bin/env python3
"""Song transcriber: Whisper lyrics detection and alignment."""
import asyncio
import json
import logging
import os

from app.audio.lyrics_alignment import align_lyrics
from app.audio.lyrics_detection import _run_whisper, save_lyrics
from app.config import settings
from app.database import get_db, init_db
from app.songs import repository as song_repo
from app.tasks import repository as task_repo

import redis.asyncio as aioredis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("worker.transcriber")


async def _publish(r, task_id: str, status: str, step: str, progress: float, message: str = "", error: str = ""):
    payload = {"task_id": task_id, "status": status, "step": step, "progress": progress}
    if message:
        payload["message"] = message
    if error:
        payload["error"] = error
    await r.publish(f"progress:{task_id}", json.dumps(payload))


def _whisper_only_from_text(text: str) -> list[dict]:
    """Assign estimated timestamps to plain text words (fallback when Whisper finds nothing)."""
    words = []
    current_time = 0.0
    for word in text.split():
        duration = max(0.2, len(word) / 5.0)
        words.append({
            "word": word,
            "start": current_time,
            "end": current_time + duration,
            "is_phrase_start": not words or word[-1] in ".!?",
        })
        current_time += duration
    return words


async def process_lyrics(r, db, task_id: str, song_id: str, language: str):
    await task_repo.update_task(db, task_id, status="running", step="transcribing", progress=0)
    await _publish(r, task_id, "running", "transcribing", 0.0, message="Starting transcription...")
    logger.info(f"[{task_id}] Published start message")

    song = await song_repo.get_song(db, song_id)
    if not song:
        raise RuntimeError(f"Song {song_id} not found")

    song_dir = settings.songs_dir / song_id
    logger.info(f"[{task_id}] Running Whisper on {song_dir}")
    success = await save_lyrics(song_dir, song.title, song.artist, song.youtube_url, language)
    logger.info(f"[{task_id}] Whisper complete, success={success}")

    if success:
        lyrics_path = song_dir / "lyrics.json"
        if lyrics_path.exists():
            await song_repo.update_lyrics(db, song_id, json.loads(lyrics_path.read_text()))
        await task_repo.update_task(db, task_id, status="completed", step="done", progress=1.0)
        await _publish(r, task_id, "completed", "done", 1.0)
        logger.info(f"[{task_id}] transcription completed for song {song_id}")
    else:
        err = "Whisper failed to detect lyrics"
        await task_repo.update_task(db, task_id, status="failed", step="error", error=err)
        await _publish(r, task_id, "failed", "error", 0.0, error=err)
        logger.warning(f"[{task_id}] transcription failed for song {song_id}")


async def process_custom_lyrics(r, db, task_id: str, song_id: str, lyrics_text: str):
    await task_repo.update_task(db, task_id, status="running", step="transcribing", progress=0)
    await _publish(r, task_id, "running", "transcribing", 0.0, message="Getting timestamps...")

    song = await song_repo.get_song(db, song_id)
    if not song:
        raise RuntimeError(f"Song {song_id} not found")

    song_dir = settings.songs_dir / song_id
    loop = asyncio.get_running_loop()
    whisper_words = await asyncio.wait_for(
        loop.run_in_executor(None, _run_whisper, song_dir),
        timeout=600,
    )

    if lyrics_text and whisper_words:
        final_words = align_lyrics(lyrics_text, whisper_words)
    elif lyrics_text:
        final_words = _whisper_only_from_text(lyrics_text)
    else:
        final_words = []

    lyrics_data = {"words": final_words, "source": "custom", "custom_text": lyrics_text}
    await song_repo.update_lyrics(db, song_id, lyrics_data)

    try:
        from app.audio.lyrics_detection import _save_lyrics_md
        _save_lyrics_md(song_dir, song.title, song.artist, lyrics_data)
    except Exception as md_exc:
        logger.warning(f"Failed to write lyrics MD (non-fatal): {md_exc}")

    await task_repo.update_task(db, task_id, status="completed", step="done", progress=1.0)
    await _publish(r, task_id, "completed", "done", 1.0)
    logger.info(f"[{task_id}] custom lyrics processed for song {song_id}")


async def main():
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
    r = aioredis.from_url(redis_url, decode_responses=True)

    await init_db()
    db = await get_db()
    await task_repo.fail_stale_tasks(db, "Worker restarted; please retry")
    logger.info("Song transcriber ready — listening on queue:transcriber")

    while True:
        try:
            _, raw = await r.brpop("queue:transcriber", timeout=0)
            job = json.loads(raw)
            task_id = job["task_id"]
            song_id = job["song_id"]
            task_type = job.get("task_type", "lyrics")
            params = job.get("params", {})

            existing = await task_repo.get_task(db, task_id)
            if existing and existing.status in ("failed", "completed"):
                logger.info(f"Skipping already-{existing.status} task {task_id}")
                continue

            logger.info(f"Processing {task_type} task {task_id}")
            try:
                if task_type == "lyrics":
                    await process_lyrics(r, db, task_id, song_id, params.get("language", "vi"))
                elif task_type == "custom_lyrics":
                    await process_custom_lyrics(r, db, task_id, song_id, params.get("lyrics_text", ""))
                else:
                    logger.warning(f"Unknown task_type: {task_type}")
            except Exception as e:
                logger.exception(f"Task {task_id} failed: {e}")
                err = str(e)[:500]
                await task_repo.update_task(db, task_id, status="failed", step="error", error=err)
                await _publish(r, task_id, "failed", "error", 0.0, error=err)
        except Exception as outer:
            logger.exception(f"Worker loop error: {outer}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())