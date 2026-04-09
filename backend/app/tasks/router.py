from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from app.database import get_db
from app.models import TaskOut
from app.tasks import repository as task_repo
from app.tasks import pubsub
import asyncio
import json

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: str):
    db = await get_db()
    task = await task_repo.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.websocket("/{task_id}/ws")
async def task_ws(websocket: WebSocket, task_id: str):
    await websocket.accept()
    q = pubsub.subscribe(task_id)
    try:
        # Send current status immediately
        db = await get_db()
        task = await task_repo.get_task(db, task_id)
        if task:
            await websocket.send_json({
                "task_id": task_id,
                "status": task.status,
                "step": task.step,
                "progress": task.progress,
            })

        # Stream updates
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=30)
                await websocket.send_json(msg)
                if msg.get("status") in ("completed", "failed"):
                    break
            except asyncio.TimeoutError:
                # Send ping to keep alive
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        pubsub.unsubscribe(task_id, q)
        await websocket.close()
