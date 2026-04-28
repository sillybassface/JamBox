#!/usr/bin/env python3
"""Song analyzer: Demucs stem separation, waveform generation, chord detection."""
import asyncio
import json
import logging
import os

from app.audio.chord_detection import save_chords
from app.config import settings
from app.database import get_db, init_db
from app.songs import repository as song_repo
from app.tasks import repository as task_repo
from app.tasks.pipeline import run_analysis

import redis.asyncio as aioredis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("worker.analyzer")


async def _publish(r, task_id: str, status: str, step: str, progress: float, message: str = "", error: str = ""):
    payload = {"task_id": task_id, "status": status, "step": step, "progress": progress}
    if message:
        payload["message"] = message
    if error:
        payload["error"] = error
    await r.publish(f"progress:{task_id}", json.dumps(payload))


async def process_analyze(r, db, task_id: str, song_id: str):
    async def progress(step: str, pct: float, msg: str):
        await task_repo.update_task(db, task_id, status="running", step=step, progress=pct)
        await song_repo.update_song_status(db, song_id, status=step)
        await _publish(r, task_id, "running", step, pct, message=msg)
        logger.info(f"[{task_id}] {step} {pct:.0%} — {msg}")

    await run_analysis(song_id, progress)
    await task_repo.update_task(db, task_id, status="completed", step="done", progress=1.0)
    await song_repo.update_song_status(db, song_id, status="ready")
    await _publish(r, task_id, "completed", "done", 1.0)
    logger.info(f"[{task_id}] completed")


async def process_chords_only(r, db, task_id: str, song_id: str):
    await task_repo.update_task(db, task_id, status="running", step="chords", progress=0)
    await _publish(r, task_id, "running", "chords", 0.0, message="Detecting chords…")

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, save_chords, settings.songs_dir / song_id)

    await task_repo.update_task(db, task_id, status="completed", step="done", progress=1.0)
    await _publish(r, task_id, "completed", "done", 1.0)
    logger.info(f"[{task_id}] chords-only completed")


async def main():
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
    r = aioredis.from_url(redis_url, decode_responses=True)

    await init_db()
    db = await get_db()
    await task_repo.fail_stale_tasks(db, "Worker restarted; please retry")

    logger.info("Song analyzer ready — listening on queue:analyzer")

    while True:
        try:
            _, raw = await r.brpop("queue:analyzer", timeout=0)
            job = json.loads(raw)
            task_id = job["task_id"]
            song_id = job["song_id"]
            task_type = job.get("task_type", "analyze")
            params = job.get("params", {})

            logger.info(f"Processing {task_type} task {task_id}")
            try:
                if task_type == "analyze":
                    await process_analyze(r, db, task_id, song_id)
                elif task_type == "chords_only":
                    await process_chords_only(r, db, task_id, song_id)
                else:
                    logger.warning(f"Unknown task_type: {task_type}")
            except Exception as e:
                logger.exception(f"Task {task_id} failed: {e}")
                err = str(e)[:500]
                await task_repo.update_task(db, task_id, status="failed", step="error", error=err)
                await song_repo.update_song_status(db, song_id, status="error", error=err)
                await _publish(r, task_id, "failed", "error", 0.0, error=err)
        except Exception as outer:
            logger.exception(f"Worker loop error: {outer}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
