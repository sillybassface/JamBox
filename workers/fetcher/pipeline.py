"""Download step: yt-dlp audio extraction."""
import asyncio
from pathlib import Path
from typing import Callable, Awaitable

from app.config import settings


ProgressCallback = Callable[[str, float, str], Awaitable[None]]


async def _run_subprocess(cmd: list[str]) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()


async def step_download(song_id: str, youtube_url: str, progress: ProgressCallback):
    """Download audio as WAV using yt-dlp."""
    song_dir = settings.songs_dir / song_id
    song_dir.mkdir(parents=True, exist_ok=True)
    output_path = song_dir / "original.%(ext)s"

    await progress("downloading", 0.0, "Starting download...")

    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-x",
        "--audio-format", "wav",
        "--audio-quality", "0",
        "-o", str(output_path),
        youtube_url,
    ]
    code, _, stderr = await _run_subprocess(cmd)
    if code != 0:
        raise RuntimeError(f"yt-dlp failed: {stderr[-500:]}")

    if not (song_dir / "original.wav").exists():
        any_audio = list(song_dir.glob("original.*"))
        if not any_audio:
            raise RuntimeError("No audio file found after download")
        src = any_audio[0]
        dest = song_dir / "original.wav"
        conv_code, _, conv_err = await _run_subprocess([
            "ffmpeg", "-i", str(src), "-ar", "44100", "-ac", "2", str(dest), "-y"
        ])
        if conv_code != 0:
            raise RuntimeError(f"ffmpeg wav conversion failed: {conv_err}")
        src.unlink()

    await progress("downloading", 1.0, "Download complete")
