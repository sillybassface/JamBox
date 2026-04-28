"""Redis-backed pub/sub for task progress → WebSocket clients."""
import json
import redis.asyncio as aioredis
from app.redis_client import get_redis


async def publish(task_id: str, data: dict):
    r = await get_redis()
    await r.publish(f"progress:{task_id}", json.dumps(data))


async def subscribe(task_id: str) -> aioredis.client.PubSub:
    r = await get_redis()
    ps = r.pubsub()
    await ps.subscribe(f"progress:{task_id}")
    return ps


async def unsubscribe(ps: aioredis.client.PubSub):
    await ps.unsubscribe()
    await ps.aclose()
