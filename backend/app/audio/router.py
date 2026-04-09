from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
import json
import aiofiles
from app.config import settings
from app.models import WaveformData

router = APIRouter(prefix="/api/audio", tags=["audio"])

STEM_NAMES = {"vocals", "drums", "bass", "guitar", "other"}


def _stem_path(song_id: str, stem: str) -> Path:
    return settings.songs_dir / song_id / "stems" / f"{stem}.mp3"


def _waveform_path(song_id: str, stem: str) -> Path:
    return settings.songs_dir / song_id / "waveforms" / f"{stem}.json"


@router.get("/{song_id}/{stem}")
async def stream_stem(song_id: str, stem: str, request: Request):
    path = _stem_path(song_id, stem)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Stem '{stem}' not found")

    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        # Parse range
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
    path = _waveform_path(song_id, stem)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Waveform for '{stem}' not found")
    async with aiofiles.open(path, "r") as f:
        data = json.loads(await f.read())
    return WaveformData(**data)
