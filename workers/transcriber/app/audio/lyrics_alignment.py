"""Lyrics alignment using Whisper timestamps and fuzzy matching."""
import logging
import re
from typing import List

logger = logging.getLogger(__name__)


def align_lyrics(external_text: str, whisper_words: list[dict]) -> list[dict]:
    """Align external lyrics text to Whisper word timestamps.

    Uses fuzzy matching to correct Whisper recognition errors.
    """
    if not whisper_words:
        return _whisper_only(whisper_words)

    external_tokens = [w.strip() for w in re.split(r'\s+', external_text) if w.strip()]
    if not external_tokens:
        return _whisper_only(whisper_words)

    result = _correct_with_external(whisper_words, external_tokens)
    logger.info(f"Aligned: {len(whisper_words)} whisper words, {result['corrections']} corrections from external")
    return result["words"]


def _whisper_only(whisper_words: list[dict]) -> list[dict]:
    """Use Whisper words as-is (base transcription)."""
    if not whisper_words:
        return []

    final_words = []
    for w in whisper_words:
        text = w.get("word", "").strip()
        if text:
            final_words.append({
                "word": text,
                "start": round(w.get("start", 0), 3),
                "end": round(w.get("end", 0), 3),
                "is_phrase_start": False,
            })

    return _detect_phrase_boundaries(final_words)


_MIN_PHRASE_GAP = 0.30  # absolute seconds — must have an audible pause to start a new phrase

def _detect_phrase_boundaries(words: list[dict]) -> list[dict]:
    """Mark phrase-start words (after long pauses or sentence-ending punctuation).

    A phrase boundary is triggered by:
    - a gap >= _MIN_PHRASE_GAP (audible pause), OR
    - the previous word ends with sentence-ending punctuation, OR
    - the current word is capitalised AND there is at least a small gap (>0.05 s) before it
      — prevents splitting mid-phrase compounds that whisper happens to capitalise at an
        internal segment boundary with no audible pause between them.
    """
    if not words:
        return words

    for i, w in enumerate(words):
        prev = words[i - 1] if i > 0 else None
        gap = (w["start"] - prev["end"]) if prev else 0.0
        w["is_phrase_start"] = bool(
            i == 0
            or gap >= _MIN_PHRASE_GAP
            or (prev and prev["word"][-1:] in ".!?")
            or (w["word"][:1].isupper() and gap > 0.05)
        )
    return words


def _correct_with_external(whisper_words: list[dict], external_tokens: list[str]) -> dict:
    """Correct Whisper tokens using external text via greedy alignment."""
    corrections = 0
    final_words = []

    for ww in whisper_words:
        word = ww.get("word", "").strip()
        start = round(ww.get("start", 0), 3)
        end = round(ww.get("end", 0), 3)

        if not word:
            continue

        if not external_tokens:
            final_words.append({
                "word": word,
                "start": start,
                "end": end,
                "corrected": False,
            })
            continue

        # Simple character-level similarity check
        external = external_tokens[0]
        similarity = _char_similarity(word, external)

        if similarity >= 0.6:
            final_words.append({
                "word": external,
                "start": start,
                "end": end,
                "corrected": similarity < 0.9,
            })
            if similarity < 0.9:
                corrections += 1
            external_tokens = external_tokens[1:]
        else:
            final_words.append({
                "word": word,
                "start": start,
                "end": end,
                "corrected": False,
            })

    return {
        "words": _detect_phrase_boundaries(final_words),
        "corrections": corrections,
    }


def _char_similarity(a: str, b: str) -> float:
    """Simple character-level similarity score."""
    a_lower = a.lower()
    b_lower = b.lower()

    if a_lower == b_lower:
        return 1.0
    if a_lower in b_lower or b_lower in a_lower:
        return 0.8

    len_min = min(len(a), len(b))
    len_max = max(len(a), len(b))
    if len_max == 0:
        return 0.0

    matches = sum(1 for i in range(len_min) if a_lower[i] == b_lower[i])
    return matches / len_max


def _greedy_align(external_tokens: list[str], whisper_words: list[dict]) -> list[dict]:
    """Assign estimated timestamps to plain text (fallback)."""
    return _whisper_only(whisper_words)