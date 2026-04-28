from fastapi import APIRouter, HTTPException, Request, Body
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pathlib import Path
import asyncio
import json
import logging
import aiofiles
import re
import uuid
from app.config import settings
from app.models import WaveformData

router = APIRouter(prefix="/api/audio", tags=["audio"])
logger = logging.getLogger(__name__)

STEM_NAMES = {"vocals", "drums", "bass", "guitar", "other"}
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def _stem_path(song_id: str, stem: str) -> Path:
    return settings.songs_dir / song_id / "stems" / f"{stem}.mp3"


def _waveform_path(song_id: str, stem: str) -> Path:
    return settings.songs_dir / song_id / "waveforms" / f"{stem}.json"


def _chords_path(song_id: str) -> Path:
    return settings.songs_dir / song_id / "chords.json"


def _validate_song_id(song_id: str) -> None:
    if not UUID_PATTERN.match(song_id):
        raise HTTPException(status_code=400, detail="Invalid song ID format")


# ── Chord routes registered BEFORE /{song_id}/{stem} to avoid path conflict ──


def _migrate_v1_to_v2(data: dict) -> dict:
    """Synthesise a v2 shape from a v1 chords.json on the fly (no disk write)."""
    if data.get("schema_version", 1) >= 2:
        return data

    beat_times: list = data.get("beat_times", [])
    downbeat_times: list = data.get("downbeat_times", [])
    duration: float = data.get("duration", 0.0)
    tempo: float = data.get("tempo", 120.0)
    time_sig_num: int = data.get("time_signature", 4)
    beat_duration: float = data.get("beat_duration", 60.0 / tempo if tempo > 0 else 0.5)
    measure_duration: float = data.get("measure_duration", beat_duration * time_sig_num)
    first_downbeat: float = downbeat_times[0] if downbeat_times else 0.0

    section = {
        "index": 0,
        "start": 0.0,
        "end": duration,
        "tempo": tempo,
        "time_sig": {"num": time_sig_num, "den": 4},
        "beat_duration": beat_duration,
        "measure_duration": measure_duration,
        "first_downbeat": first_downbeat,
        "confidence": 0.5,
    }

    measures = [
        {**m, "section_index": 0}
        for m in data.get("measures", [])
    ]

    migrated = {
        "schema_version": 2,
        "key": data.get("key", "C"),
        "duration": duration,
        "global_tempo": tempo,
        "tempo_stability": data.get("tempo_stability", "stable"),
        "tempo_profile": data.get("tempo_profile", [{"time": 0.0, "bpm": tempo}]),
        "sections": [section],
        "beat_times": beat_times,
        "downbeat_times": downbeat_times,
        "measures": measures,
    }

    if not beat_times:
        migrated["legacy"] = True

    return migrated


@router.get("/{song_id}/chords")
async def get_chords(song_id: str):
    _validate_song_id(song_id)
    path = _chords_path(song_id)
    if not path.exists():
        return JSONResponse(status_code=202, content={"status": "not_ready"})
    async with aiofiles.open(path, "r") as f:
        data = json.loads(await f.read())
    data = _migrate_v1_to_v2(data)
    return JSONResponse(content=data)


@router.post("/{song_id}/chords", status_code=202)
async def generate_chords(song_id: str, force: bool = False):
    """Trigger on-demand chord detection for an existing song.

    Pass force=true to delete the existing chords.json and re-analyse.
    """
    from app.database import get_db
    from app.tasks import repository as task_repo
    from app.tasks.worker import enqueue_chords_only

    _validate_song_id(song_id)
    path = _chords_path(song_id)
    if force and path.exists():
        path.unlink()
    if path.exists():
        return {"status": "ready"}
    song_dir = settings.songs_dir / song_id
    if not song_dir.exists():
        raise HTTPException(status_code=404, detail="Song not found")

    db = await get_db()
    task_id = str(uuid.uuid4())
    await task_repo.create_task(db, task_id, song_id, "chords")
    await enqueue_chords_only(task_id, song_id)
    return {"status": "generating", "task_id": task_id}


@router.patch("/{song_id}/chords/section/{section_idx}/time-sig", status_code=204)
async def set_section_time_sig(song_id: str, section_idx: int, body: dict = Body(...)):
    """Override the time signature for one section and immediately rebuild its measures."""
    from app.audio.helpers import rebuild_measures_for_section_timesig, update_chords_file

    _validate_song_id(song_id)
    num = body.get("num")
    den = body.get("den")
    if num not in {2, 3, 4, 5, 6, 7, 8, 9, 12}:
        raise HTTPException(status_code=400, detail="num must be one of 2,3,4,5,6,7,8,9,12")
    if den not in {2, 4, 8}:
        raise HTTPException(status_code=400, detail="den must be one of 2,4,8")
    path = _chords_path(song_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Chords not found")
    async with aiofiles.open(path, "r") as f:
        data = json.loads(await f.read())
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(
        None, rebuild_measures_for_section_timesig, data, section_idx, num, den
    )
    await update_chords_file(song_id, data)


# ── Stem audio routes ──


@router.get("/{song_id}/{stem}")
async def stream_stem(song_id: str, stem: str, request: Request):
    _validate_song_id(song_id)
    path = _stem_path(song_id, stem)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Stem '{stem}' not found")

    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        range_val = range_header.replace("bytes=", "")
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        async def iter_file():
            async with aiofiles.open(path, "rb") as f:
                await f.seek(start)
                remaining = length
                chunk_size = 65536
                while remaining > 0:
                    chunk = await f.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    yield chunk
                    remaining -= len(chunk)

        return StreamingResponse(
            iter_file(),
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Type": "audio/mpeg",
            },
        )

    return FileResponse(
        str(path),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
    )


@router.get("/{song_id}/{stem}/waveform", response_model=WaveformData)
async def get_waveform(song_id: str, stem: str):
    _validate_song_id(song_id)
    path = _waveform_path(song_id, stem)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Waveform for '{stem}' not found")
    async with aiofiles.open(path, "r") as f:
        data = json.loads(await f.read())
    return WaveformData(**data)
