from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pathlib import Path
import asyncio
import json
import logging
import aiofiles
import re
from app.config import settings
from app.models import WaveformData

router = APIRouter(prefix="/api/audio", tags=["audio"])
logger = logging.getLogger(__name__)

STEM_NAMES = {"vocals", "drums", "bass", "guitar", "other"}
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def _validate_song_id(song_id: str) -> None:
    if not UUID_PATTERN.match(song_id):
        raise HTTPException(status_code=400, detail="Invalid song ID format")


# Song IDs currently undergoing on-demand chord detection
_generating: set[str] = set()


def _stem_path(song_id: str, stem: str) -> Path:
    return settings.songs_dir / song_id / "stems" / f"{stem}.mp3"


def _waveform_path(song_id: str, stem: str) -> Path:
    return settings.songs_dir / song_id / "waveforms" / f"{stem}.json"


def _chords_path(song_id: str) -> Path:
    return settings.songs_dir / song_id / "chords.json"


async def _run_chord_detection(song_id: str):
    from app.audio.chord_detection import save_chords

    song_dir = settings.songs_dir / song_id
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, save_chords, song_dir)
        logger.info(f"On-demand chord detection complete for {song_id}")
    except Exception as exc:
        logger.warning(f"On-demand chord detection failed for {song_id}: {exc}")
    finally:
        _generating.discard(song_id)


# ── Chord routes registered BEFORE /{song_id}/{stem} to avoid path conflict ──


@router.get("/{song_id}/chords")
async def get_chords(song_id: str):
    _validate_song_id(song_id)
    path = _chords_path(song_id)
    if not path.exists():
        return JSONResponse(status_code=202, content={"status": "not_ready"})
    async with aiofiles.open(path, "r") as f:
        data = json.loads(await f.read())
    return JSONResponse(content=data)


@router.post("/{song_id}/chords", status_code=202)
async def generate_chords(song_id: str, force: bool = False):
    """Trigger on-demand chord detection for an existing song.

    Pass force=true to delete the existing chords.json and re-analyse.
    """
    _validate_song_id(song_id)
    path = _chords_path(song_id)
    if force and path.exists():
        path.unlink()
    if path.exists():
        return {"status": "ready"}
    song_dir = settings.songs_dir / song_id
    if not song_dir.exists():
        raise HTTPException(status_code=404, detail="Song not found")
    if song_id not in _generating:
        _generating.add(song_id)
        asyncio.create_task(_run_chord_detection(song_id))
    return {"status": "generating"}


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
