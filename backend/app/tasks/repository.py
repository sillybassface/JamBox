import aiosqlite
from typing import Optional
from app.models import TaskOut


def _row_to_task(row: aiosqlite.Row) -> TaskOut:
    return TaskOut(
        id=row["id"],
        song_id=row["song_id"],
        status=row["status"],
        step=row["step"],
        progress=row["progress"] or 0,
        error=row["error"],
        created_at=row["created_at"],
    )


async def create_task(
    db: aiosqlite.Connection, task_id: str, song_id: str, step: Optional[str] = None
) -> TaskOut:
    await db.execute(
        "INSERT INTO tasks (id, song_id, step) VALUES (?, ?, ?)",
        (task_id, song_id, step),
    )
    await db.commit()
    return await get_task(db, task_id)


async def get_task(db: aiosqlite.Connection, task_id: str) -> Optional[TaskOut]:
    async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return _row_to_task(row)


async def update_task(
    db: aiosqlite.Connection,
    task_id: str,
    status: str,
    step: Optional[str] = None,
    progress: float = 0,
    error: Optional[str] = None,
):
    await db.execute(
        "UPDATE tasks SET status=?, step=?, progress=?, error=? WHERE id=?",
        (status, step, progress, error, task_id),
    )
    await db.commit()


async def get_incomplete_tasks(db: aiosqlite.Connection) -> list[TaskOut]:
    async with db.execute(
        "SELECT * FROM tasks WHERE status IN ('queued', 'running') ORDER BY created_at"
    ) as cur:
        rows = await cur.fetchall()
    return [_row_to_task(r) for r in rows]


async def get_task_by_song_and_step(
    db: aiosqlite.Connection, song_id: str, step: str
) -> Optional[TaskOut]:
    """Get most recent task for a song with a given step."""
    async with db.execute(
        "SELECT * FROM tasks WHERE song_id = ? AND step = ? ORDER BY created_at DESC LIMIT 1",
        (song_id, step),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return _row_to_task(row)


async def get_active_lyrics_task(
    db: aiosqlite.Connection, song_id: str
) -> Optional[TaskOut]:
    """Get the most recent lyrics task regardless of current step name."""
    async with db.execute(
        """SELECT * FROM tasks
           WHERE song_id = ? AND step IN ('lyrics', 'transcribing', 'aligning')
           AND status IN ('queued', 'running')
           ORDER BY created_at DESC LIMIT 1""",
        (song_id,),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return _row_to_task(row)


async def fail_stale_tasks(db: aiosqlite.Connection, error: str) -> None:
    """Mark in-flight running tasks as failed on worker startup.

    Only targets 'running' — 'queued' tasks are untouched because they still
    exist in the Redis queue and will be picked up and processed normally.
    """
    await db.execute(
        "UPDATE tasks SET status='failed', error=? WHERE status = 'running'",
        (error,),
    )
    await db.commit()
