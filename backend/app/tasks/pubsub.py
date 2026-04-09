"""In-memory pub/sub for task progress → WebSocket clients."""
import asyncio
from collections import defaultdict
from typing import Callable

_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)


def subscribe(task_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers[task_id].append(q)
    return q


def unsubscribe(task_id: str, q: asyncio.Queue):
    try:
        _subscribers[task_id].remove(q)
    except ValueError:
        pass


async def publish(task_id: str, data: dict):
    for q in list(_subscribers.get(task_id, [])):
        await q.put(data)
