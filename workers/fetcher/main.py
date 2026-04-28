#!/usr/bin/env python3
"""Song fetcher: downloads YouTube audio and hands off to song-analyzer."""
import asyncio
import json
import logging
import os

from app.database import get_db, init_db
from app.songs import repository as song_repo
from app.tasks import repository as task_repo
from pipeline import step_download

import redis.asyncio as aioredis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("worker.fetcher")

QUEUE_FETCHER = "queue:fetcher"
QUEUE_ANALYZER = "queue:analyzer"


async def _publish(r, task_id: str, status: str, step: str, progress: float, message: str = "", error: str = ""):
    payload = {"task_id": task_id, "status": status, "step": step, "progress": progress}
    if message:
        payload["message"] = message
    if error:
        payload["error"] = error
    await r.publish(f"progress:{task_id}", json.dumps(payload))


async def process_fetch(r, db, task_id: str, song_id: str, youtube_url: str):
    async def progress(step: str, pct: float, msg: str):
        await task_repo.update_task(db, task_id, status="running", step=step, progress=pct)
        await song_repo.update_song_status(db, song_id, status=step)
        await _publish(r, task_id, "running", step, pct, message=msg)
        logger.info(f"[{task_id}] {step} {pct:.0%} — {msg}")

    await task_repo.update_task(db, task_id, status="running", step="fetching", progress=0)
    await _publish(r, task_id, "running", "fetching", 0.0, message="Starting download…")

    await step_download(song_id, youtube_url, progress)

    await r.lpush(QUEUE_ANALYZER, json.dumps({
        "task_id": task_id,
        "song_id": song_id,
        "task_type": "analyze",
        "params": {},
    }))
    logger.info(f"[{task_id}] fetch complete, enqueued to {QUEUE_ANALYZER}")


async def main():
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
    r = aioredis.from_url(redis_url, decode_responses=True)

    await init_db()
    db = await get_db()
    await task_repo.fail_stale_tasks(db, "Worker restarted; please retry")

    logger.info("Song fetcher ready — listening on queue:fetcher")

    while True:
        try:
            _, raw = await r.brpop(QUEUE_FETCHER, timeout=0)
            job = json.loads(raw)
            task_id = job["task_id"]
            song_id = job["song_id"]
            params = job.get("params", {})

            logger.info(f"Processing fetch task {task_id}")
            try:
                await process_fetch(r, db, task_id, song_id, params["youtube_url"])
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
