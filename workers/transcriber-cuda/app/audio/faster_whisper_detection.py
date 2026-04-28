"""Lyrics detection using faster-whisper with CUDA for the kelvinbksoh model."""
import json
import logging
from pathlib import Path

from app.audio.lyrics_fetch import fetch_external_lyrics
from app.audio.lyrics_alignment import align_lyrics, _whisper_only
from app.audio.lyrics_detection import _save_lyrics_md

logger = logging.getLogger(__name__)

HF_MODEL_ID = "kelvinbksoh/whisper-medium-vietnamese-lyrics-transcription"
_CT2_MODEL_DIR = Path("/model_cache/ct2-kelvin")


def _ensure_ct2_model() -> Path:
    """Convert the kelvinbksoh HF model to CTranslate2 format on first use."""
    if _CT2_MODEL_DIR.exists() and (_CT2_MODEL_DIR / "model.bin").exists():
        return _CT2_MODEL_DIR

    import subprocess
    import sys
    _CT2_MODEL_DIR.parent.mkdir(parents=True, exist_ok=True)
    logger.info(f"Converting {HF_MODEL_ID} to CTranslate2 format (one-time, may take a few minutes)...")
    result = subprocess.run(
        [
            "ct2-transformers-converter",
            "--model", HF_MODEL_ID,
            "--output_dir", str(_CT2_MODEL_DIR),
            "--quantization", "float16",
            "--force",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Model conversion failed: {result.stderr[-500:]}")
    logger.info("Model conversion complete")
    return _CT2_MODEL_DIR


def _run_whisper(song_dir: Path, language: str | None = "vi") -> list[dict]:
    """Run faster-whisper on the vocals stem using CUDA."""
    vocals_path = song_dir / "stems" / "vocals.mp3"
    if not vocals_path.exists():
        return []

    from faster_whisper import WhisperModel
    import ctranslate2

    model_path = _ensure_ct2_model()
    device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    logger.info(f"Loading faster-whisper model on {device} ({compute_type})")
    model = WhisperModel(str(model_path), device=device, compute_type=compute_type)

    segments, _ = model.transcribe(
        str(vocals_path),
        language="vi",  # kelvin is always Vietnamese
        word_timestamps=True,
        vad_filter=True,
    )

    words = []
    for segment in segments:
        for word in segment.words:
            text = word.word.strip()
            if text:
                words.append({
                    "word": text,
                    "start": round(word.start, 3),
                    "end": round(word.end, 3),
                })
    return words


async def save_lyrics(
    song_dir: Path,
    title: str,
    artist: str | None = None,
    youtube_url: str | None = None,
    language: str = "vi",
) -> bool:
    import asyncio
    from app.audio.lyrics_alignment import _detect_phrase_boundaries

    try:
        whisper_words = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _run_whisper, song_dir, language),
            timeout=600,
        )

        if not whisper_words:
            logger.warning("No faster-whisper words detected")
            return False

        source = "faster-whisper"

        external_text = None
        if title:
            try:
                external_text = await fetch_external_lyrics(title, artist, youtube_url)
            except Exception:
                pass

            if external_text:
                logger.info(f"Found external lyrics for {title}")
                final_words = align_lyrics(external_text, whisper_words)
                corrections = sum(1 for w in final_words if w.get("corrected"))
                source = f"faster-whisper+hybrid ({corrections} corrections)"
            else:
                final_words = _whisper_only(whisper_words)
                final_words = _detect_phrase_boundaries(final_words)
        else:
            final_words = _whisper_only(whisper_words)
            final_words = _detect_phrase_boundaries(final_words)

        for w in final_words:
            w.pop("corrected", None)

        lyrics_data = {"words": final_words, "source": source}

        lyrics_path = song_dir / "lyrics.json"
        lyrics_path.write_text(json.dumps(lyrics_data, indent=2))
        logger.info(f"Saved lyrics with {len(final_words)} words, source: {source}")

        try:
            _save_lyrics_md(song_dir, title, artist, lyrics_data)
        except Exception as md_exc:
            logger.warning(f"Failed to write lyrics MD (non-fatal): {md_exc}")

        return True

    except Exception as e:
        logger.warning(f"Lyrics detection failed: {e}")
        return False
