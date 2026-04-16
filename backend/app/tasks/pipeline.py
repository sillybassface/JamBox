"""Processing pipeline: download → separate → waveform.

Demucs is invoked with --mp3 so it outputs MP3s directly, bypassing the
torchcodec/WAV save path that requires an optional dependency. The separate
ffmpeg conversion step is eliminated.
"""
import asyncio
import json
import shutil
from pathlib import Path
from typing import Callable, Awaitable
import numpy as np

from app.config import settings


ProgressCallback = Callable[[str, float, str], Awaitable[None]]
# (step_name, progress_0_to_1, message)

# Demucs wrapper script — monkey-patches torchaudio.save to use soundfile
# instead of torchcodec (unavailable in this environment). Run via
# /usr/bin/python3 explicitly to avoid linuxbrew Python 3.14 on PATH.
DEMUCS_WRAPPER = str(Path(__file__).parent.parent.parent / "demucs_wrapper.py")
PYTHON_BIN = "/usr/bin/python3"

# Fraction of total pipeline progress allocated to stem separation (0–1).
# Waveform generation occupies the remaining slice.
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
    code, stdout, stderr = await run_subprocess(cmd)
    if code != 0:
        raise RuntimeError(f"yt-dlp failed: {stderr[-500:]}")

    # Ensure we have original.wav
    if not (song_dir / "original.wav").exists():
        any_audio = list(song_dir.glob("original.*"))
        if not any_audio:
            raise RuntimeError("No audio file found after download")
        src = any_audio[0]
        dest = song_dir / "original.wav"
        conv_code, _, conv_err = await run_subprocess([
            "ffmpeg", "-i", str(src), "-ar", "44100", "-ac", "2", str(dest), "-y"
        ])
        if conv_code != 0:
            raise RuntimeError(f"ffmpeg wav conversion failed: {conv_err}")
        src.unlink()

    await progress("downloading", 1.0, "Download complete")


async def step_separate(song_id: str, progress: ProgressCallback):
    """Run Demucs stem separation, outputting MP3s directly via --mp3.

    Streams stderr line-by-line to parse tqdm progress bars and emit
    real-time progress updates instead of blocking until completion.
    """
    import re
    song_dir = settings.songs_dir / song_id
    wav_path = song_dir / "original.wav"
    stems_dir = song_dir / "stems"
    stems_dir.mkdir(exist_ok=True)

    if not wav_path.exists():
        raise RuntimeError("original.wav not found")

    await progress("separating", 0.0, "Starting stem separation (this takes a few minutes)…")

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

    # tqdm writes progress using \r (carriage return), not \n.
    # asyncio readline() buffers until \n, so we must read raw chunks instead.
    # Pattern: "  34%|████| 111.1/327.6 [00:30<00:58, 3.8s/s]"
    _pct_re = re.compile(r'(\d+)%\|')
    stderr_buf = b''
    last_pct = -1

    assert proc.stderr is not None
    while True:
        chunk = await proc.stderr.read(4096)
        if not chunk:
            break
        # Cap accumulation — only needed for error reporting on failure
        if len(stderr_buf) < 16_384:
            stderr_buf += chunk
        # Split on \r or \n to find progress lines
        for part in re.split(rb'[\r\n]', chunk):
            m = _pct_re.search(part.decode(errors='replace'))
            if m:
                pct = int(m.group(1))
                if pct != last_pct:
                    last_pct = pct
                    scaled = round(pct / 100 * _SEPARATION_WEIGHT, 3)
                    await progress("separating", scaled, f"Separating… {pct}%")

    await proc.wait()
    stderr_text = stderr_buf.decode(errors='replace')

    if proc.returncode != 0:
        raise RuntimeError(f"demucs failed: {stderr_text[-1500:]}")

    await progress("separating", 0.8, "Stem separation complete, collecting outputs...")

    # Demucs output layout: demucs_out/htdemucs/<input_stem>/{vocals,drums,...}.mp3
    htdemucs_dir = demucs_out / "htdemucs"
    out_dirs = list(htdemucs_dir.glob("*/")) if htdemucs_dir.exists() else []
    if not out_dirs:
        raise RuntimeError(f"Demucs produced no output in {htdemucs_dir}")
    stem_source_dir = out_dirs[0]

    # Move MP3s into stems/
    mp3_files = list(stem_source_dir.glob("*.mp3"))
    if not mp3_files:
        raise RuntimeError(f"No MP3 files found in {stem_source_dir}")

    for mp3 in mp3_files:
        dest = stems_dir / mp3.name
        mp3.rename(dest)

    # Clean up demucs scratch directory
    shutil.rmtree(demucs_out, ignore_errors=True)

    await progress("separating", 1.0, f"Stems ready: {[f.stem for f in stems_dir.glob('*.mp3')]}")


async def step_waveform(song_id: str, progress: ProgressCallback):
    """Generate peak waveform JSON for each stem MP3.
    
    Scales progress from 90% to 100% to reflect waveform as the final 10% of total work.
    """
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


async def _background_chords(song_dir: Path):
    """Run chord detection in a thread pool; non-fatal."""
    import logging
    from app.audio.chord_detection import save_chords
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, save_chords, song_dir)
    except Exception as exc:
        logging.getLogger(__name__).warning(f"Background chord detection failed: {exc}")


async def run_pipeline(song_id: str, youtube_url: str, progress: ProgressCallback):
    """Full pipeline: download → separate (with --mp3) → waveform → chords (background)."""
    await step_download(song_id, youtube_url, progress)
    await step_separate(song_id, progress)
    await step_waveform(song_id, progress)
    # Chord detection runs in background so song is marked ready immediately
    asyncio.create_task(_background_chords(settings.songs_dir / song_id))
