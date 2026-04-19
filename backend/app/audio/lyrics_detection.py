import json
import logging
from pathlib import Path
import whisper

from app.audio.lyrics_fetch import fetch_external_lyrics
from app.audio.lyrics_alignment import align_lyrics, _whisper_only

logger = logging.getLogger(__name__)

WHISPER_MODEL = "medium"

LANGUAGE_CODES = {
    "vi": "Vietnamese",
    "en": "English",
}


def _run_whisper(song_dir: Path, language: str | None = None) -> list[dict]:
    """Run Whisper transcription (sync function to run in executor).

    Uses medium model for better accuracy.
    Args:
        language: Language code ("vi" for Vietnamese, "en" for English, None for auto-detect)
    """
    vocals_path = song_dir / "stems" / "vocals.mp3"
    if not vocals_path.exists():
        return []

    model = whisper.load_model(WHISPER_MODEL)
    result = whisper.transcribe(
        model,
        str(vocals_path),
        word_timestamps=True,
        language=language if language and language != "auto" else None,
        condition_on_previous_text=False,
    )

    words = []
    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            words.append(
                {
                    "word": word_info.get("word", "").strip(),
                    "start": round(word_info.get("start", 0), 3),
                    "end": round(word_info.get("end", 0), 3),
                }
            )
    return words


async def save_lyrics(
    song_dir: Path,
    title: str,
    artist: str | None = None,
    youtube_url: str | None = None,
    language: str = "vi",
) -> bool:
    """Run Whisper for timing, try to correct with external lyrics.

    Priority:
    1. Run Whisper to get word timestamps (always)
    2. Try to fetch from external sources (YouTube captions, APIs)
    3. Use external lyrics to correct misrecognized words (fuzzy match)
    4. Fall back to Whisper-only if nothing found externally

    Args:
        song_dir: Path to song directory
        title: Song title (for external lookup)
        artist: Artist name (optional, for external lookup)
        youtube_url: YouTube URL for caption extraction
        language: Language code ("vi" or "en")

    Returns True on success, False on failure.
    """
    import asyncio

    try:
        whisper_words = await asyncio.get_event_loop().run_in_executor(
            None, _run_whisper, song_dir, language
        )

        if not whisper_words:
            logger.warning("No Whisper words detected")
            return False

        source = "whisper"
        corrections = 0

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
                source = f"hybrid ({corrections} corrections)"
            else:
                from app.audio.lyrics_alignment import (
                    _whisper_only,
                    _detect_phrase_boundaries,
                )

                final_words = _whisper_only(whisper_words)
                final_words = _detect_phrase_boundaries(final_words)
        else:
            from app.audio.lyrics_alignment import (
                _whisper_only,
                _detect_phrase_boundaries,
            )

            final_words = _whisper_only(whisper_words)
            final_words = _detect_phrase_boundaries(final_words)

        for w in final_words:
            w.pop("corrected", None)

        lyrics_data = {
            "words": final_words,
            "source": source,
        }

        lyrics_path = song_dir / "lyrics.json"
        lyrics_path.write_text(json.dumps(lyrics_data, indent=2))
        logger.info(f"Saved lyrics with {len(final_words)} words, source: {source}")
        return True

    except Exception as e:
        logger.warning(f"Lyrics detection failed: {e}")
        return False


def save_lyrics_sync(
    song_dir: Path,
    title: str,
    artist: str | None = None,
    youtube_url: str | None = None,
    language: str = "vi",
) -> bool:
    """Sync wrapper for save_lyrics (to run in executor)."""
    import asyncio

    return asyncio.run(save_lyrics(song_dir, title, artist, youtube_url, language))
