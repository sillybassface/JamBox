from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from app.database import get_db
from app.models import TaskOut
from app.tasks import repository as task_repo
from app.tasks import pubsub
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
    ps = await pubsub.subscribe(task_id)
    try:
        db = await get_db()
        task = await task_repo.get_task(db, task_id)
        if task:
            await websocket.send_json({
                "task_id": task_id,
                "status": task.status,
                "step": task.step,
                "progress": task.progress,
            })
            if task.status in ("completed", "failed"):
                return

        async for message in ps.listen():
            if message["type"] != "message":
                continue
            data = json.loads(message["data"])
            await websocket.send_json(data)
            if data.get("status") in ("completed", "failed"):
                break
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(ps)
        await websocket.close()
