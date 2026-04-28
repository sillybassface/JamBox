"""Task enqueueing — pushes jobs to Redis queues for worker containers."""
import json
import logging
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

QUEUE_FETCHER = "queue:fetcher"
QUEUE_ANALYZER = "queue:analyzer"
QUEUE_TRANSCRIBER = "queue:transcriber"
QUEUE_TRANSCRIBER_CUDA = "queue:transcriber-cuda"

# Languages that require the CUDA faster-whisper worker.
_CUDA_LANGUAGES = frozenset({"kelvin"})


async def _push(queue: str, task_id: str, song_id: str, task_type: str, params: dict):
    r = await get_redis()
    await r.lpush(queue, json.dumps({"task_id": task_id, "song_id": song_id, "task_type": task_type, "params": params}))
    logger.info(f"Enqueued {task_type} task {task_id} for song {song_id}")


async def enqueue(task_id: str, song_id: str, youtube_url: str):
    await _push(QUEUE_FETCHER, task_id, song_id, "fetch", {"youtube_url": youtube_url})


async def enqueue_transcription(task_id: str, song_id: str, language: str = "vi"):
    queue = QUEUE_TRANSCRIBER_CUDA if language in _CUDA_LANGUAGES else QUEUE_TRANSCRIBER
    await _push(queue, task_id, song_id, "lyrics", {"language": language})


async def enqueue_custom_transcription(task_id: str, song_id: str, lyrics_text: str):
    await _push(QUEUE_TRANSCRIBER, task_id, song_id, "custom_lyrics", {"lyrics_text": lyrics_text})


async def enqueue_chords_only(task_id: str, song_id: str):
    await _push(QUEUE_ANALYZER, task_id, song_id, "chords_only", {})
