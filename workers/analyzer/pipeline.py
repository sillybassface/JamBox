"""Analysis pipeline: separate → waveform → chords.

Demucs is invoked with --mp3 so it outputs MP3s directly, bypassing the
torchcodec/WAV save path that requires an optional dependency. The separate
ffmpeg conversion step is eliminated.
"""
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Callable, Awaitable
import numpy as np

from app.config import settings


ProgressCallback = Callable[[str, float, str], Awaitable[None]]
# (step_name, progress_0_to_1, message)

# Demucs wrapper script — monkey-patches torchaudio.save to use soundfile
# instead of torchcodec (unavailable in this environment).
# Override DEMUCS_WRAPPER_PATH env var if needed.
DEMUCS_WRAPPER = os.environ.get(
    "DEMUCS_WRAPPER_PATH",
    str(Path(__file__).parent.parent.parent / "demucs_wrapper.py"),
)
PYTHON_BIN = os.environ.get("PYTHON_BIN", sys.executable)

# Fraction of total pipeline progress allocated to stem separation (0–1).
_SEPARATION_WEIGHT = 0.90


async def run_subprocess(cmd: list[str], cwd: Path | None = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()


async def step_separate(song_id: str, progress: ProgressCallback):
    """Run Demucs stem separation, outputting MP3s directly via --mp3."""
    import re
    song_dir = settings.songs_dir / song_id
    wav_path = song_dir / "original.wav"
    stems_dir = song_dir / "stems"
    stems_dir.mkdir(exist_ok=True)

    if not wav_path.exists():
        raise RuntimeError("original.wav not found")

    await progress("separating", 0.0, "Starting stem separation (this takes a few minutes)...")

    demucs_out = song_dir / "demucs_out"
    cmd = [
        PYTHON_BIN, DEMUCS_WRAPPER,
        "--name", "htdemucs",
        "--mp3",
        "--mp3-bitrate", "320",
        "-o", str(demucs_out),
        str(wav_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    _pct_re = re.compile(r'(\d+)%\|')
    stderr_buf = b''
    last_pct = -1

    assert proc.stderr is not None
    while True:
        chunk = await proc.stderr.read(4096)
        if not chunk:
            break
        if len(stderr_buf) < 16_384:
            stderr_buf += chunk
        for part in re.split(rb'[\r\n]', chunk):
            m = _pct_re.search(part.decode(errors='replace'))
            if m:
                pct = int(m.group(1))
                if pct != last_pct:
                    last_pct = pct
                    scaled = round(pct / 100 * _SEPARATION_WEIGHT, 3)
                    await progress("separating", scaled, f"Separating... {pct}%")

    await proc.wait()
    stderr_text = stderr_buf.decode(errors='replace')

    if proc.returncode != 0:
        raise RuntimeError(f"demucs failed: {stderr_text[-1500:]}")

    await progress("separating", 0.8, "Stem separation complete, collecting outputs...")

    htdemucs_dir = demucs_out / "htdemucs"
    out_dirs = list(htdemucs_dir.glob("*/")) if htdemucs_dir.exists() else []
    if not out_dirs:
        raise RuntimeError(f"Demucs produced no output in {htdemucs_dir}")
    stem_source_dir = out_dirs[0]

    mp3_files = list(stem_source_dir.glob("*.mp3"))
    if not mp3_files:
        raise RuntimeError(f"No MP3 files found in {stem_source_dir}")

    for mp3 in mp3_files:
        dest = stems_dir / mp3.name
        mp3.rename(dest)

    shutil.rmtree(demucs_out, ignore_errors=True)

    await progress("separating", 1.0, f"Stems ready: {[f.stem for f in stems_dir.glob('*.mp3')]}")


async def step_waveform(song_id: str, progress: ProgressCallback):
    """Generate peak waveform JSON for each stem MP3."""
    song_dir = settings.songs_dir / song_id
    stems_dir = song_dir / "stems"
    waveforms_dir = song_dir / "waveforms"
    waveforms_dir.mkdir(exist_ok=True)

    await progress("waveform", _SEPARATION_WEIGHT, "Generating waveforms...")

    mp3_files = list(stems_dir.glob("*.mp3"))
    if not mp3_files:
        raise RuntimeError("No stems found to generate waveforms for")

    await asyncio.gather(*[
        _generate_peaks(mp3, waveforms_dir / f"{mp3.stem}.json")
        for mp3 in mp3_files
    ])

    await progress("waveform", 1.0, "Waveforms complete")


async def _generate_peaks(mp3_path: Path, output_path: Path, samples_per_pixel: int = 512):
    """Extract PCM via ffmpeg, compute RMS peaks per window."""
    cmd = [
        "ffmpeg", "-i", str(mp3_path),
        "-f", "f32le",
        "-ar", "22050",
        "-ac", "1",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    raw_bytes, _ = await proc.communicate()

    if len(raw_bytes) < 4:
        output_path.write_text(json.dumps({
            "peaks": [], "duration": 0,
            "sample_rate": 22050, "samples_per_pixel": samples_per_pixel
        }))
        return

    samples = np.frombuffer(raw_bytes, dtype=np.float32)
    duration = len(samples) / 22050.0
    n_windows = max(1, len(samples) // samples_per_pixel)
    peaks = []
    for i in range(n_windows):
        window = samples[i * samples_per_pixel:(i + 1) * samples_per_pixel]
        if len(window) > 0:
            rms = float(np.sqrt(np.mean(window ** 2)))
            peaks.append(round(min(rms * 3, 1.0), 4))
        else:
            peaks.append(0.0)

    output_path.write_text(json.dumps({
        "peaks": peaks,
        "duration": round(duration, 3),
        "sample_rate": 22050,
        "samples_per_pixel": samples_per_pixel,
    }))


async def step_chords(song_id: str, progress: ProgressCallback):
    """Run chord + beat detection inline; non-fatal."""
    import logging
    from app.audio.chord_detection import save_chords
    logger = logging.getLogger(__name__)
    await progress("chords", 0.0, "Detecting chords and beats...")
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, save_chords, settings.songs_dir / song_id)
        await progress("chords", 1.0, "Chord detection complete")
    except Exception as exc:
        logger.warning(f"Chord detection failed (non-fatal): {exc}")


async def run_analysis(song_id: str, progress: ProgressCallback):
    """Analysis pipeline: separate (with --mp3) → waveform → chords."""
    await step_separate(song_id, progress)
    await step_waveform(song_id, progress)
    await step_chords(song_id, progress)