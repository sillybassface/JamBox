"""Asyncio background worker — processes tasks one at a time."""
import asyncio
import logging
from app.database import get_db
from app.tasks import repository as task_repo
from app.songs import repository as song_repo
from app.tasks import pubsub
from app.tasks.pipeline import run_pipeline

logger = logging.getLogger(__name__)

_queue: asyncio.Queue[str] = asyncio.Queue()
_worker_task: asyncio.Task | None = None


async def enqueue(task_id: str):
    await _queue.put(task_id)


async def _process_task(task_id: str):
    db = await get_db()
    task = await task_repo.get_task(db, task_id)
    if not task:
        logger.warning(f"Task {task_id} not found")
        return

    song = await song_repo.get_song(db, task.song_id)
    if not song:
        logger.warning(f"Song {task.song_id} not found for task {task_id}")
        return

    logger.info(f"Starting task {task_id} for song {task.song_id}")

    async def progress(step: str, pct: float, msg: str):
        await task_repo.update_task(db, task_id, status="running", step=step, progress=pct)
        await song_repo.update_song_status(db, song.id, status=step)
        payload = {"task_id": task_id, "status": "running", "step": step, "progress": pct, "message": msg}
        await pubsub.publish(task_id, payload)
        logger.info(f"[{task_id}] {step} {pct:.0%} — {msg}")

    try:
        await task_repo.update_task(db, task_id, status="running", step="starting", progress=0)
        await song_repo.update_song_status(db, song.id, "downloading")
        await run_pipeline(song.id, song.youtube_url, progress)

        await task_repo.update_task(db, task_id, status="completed", step="done", progress=1.0)
        await song_repo.update_song_status(db, song.id, "ready")
        await pubsub.publish(task_id, {"task_id": task_id, "status": "completed", "step": "done", "progress": 1.0})
        logger.info(f"Task {task_id} completed successfully")

    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        err_msg = str(e)[:500]
        await task_repo.update_task(db, task_id, status="failed", step="error", progress=0, error=err_msg)
        await song_repo.update_song_status(db, song.id, "error", error=err_msg)
        await pubsub.publish(task_id, {"task_id": task_id, "status": "failed", "error": err_msg})


async def _worker_loop():
    logger.info("Background worker started")
    while True:
        task_id = await _queue.get()
        try:
            await _process_task(task_id)
        except Exception as e:
            logger.exception(f"Worker error on task {task_id}: {e}")
        finally:
            _queue.task_done()


async def start_worker():
    global _worker_task
    db = await get_db()
    # Re-enqueue any incomplete tasks from a previous run
    incomplete = await task_repo.get_incomplete_tasks(db)
    for task in incomplete:
        logger.info(f"Re-queuing incomplete task {task.id}")
        await _queue.put(task.id)
    _worker_task = asyncio.create_task(_worker_loop())


async def stop_worker():
    global _worker_task
    if _worker_task:
        _worker_task.cancel()
        _worker_task = None
