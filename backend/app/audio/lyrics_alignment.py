import logging
import re

logger = logging.getLogger(__name__)

PUNCTUATION = set(".,!?;:")
PHRASE_BREAK_PUNCTUATION = set(".!?")


def align_lyrics(external_text: str, whisper_words: list[dict]) -> list[dict]:
    """Use Whisper timestamps as base, correct words using external lyrics.

    Priority:
    1. Always use Whisper for timing
    2. Try to correct misrecognized words using fuzzy match with external lyrics

    Args:
        external_text: Plain text lyrics from external source
        whisper_words: List of {"word": str, "start": float, "end": float} from Whisper

    Returns:
        List of {"word": str, "start": float, "end": float, "is_phrase_start": bool}
    """
    external_tokens = _tokenize(external_text)
    if not whisper_words:
        return _whisper_only(whisper_words)

    if not external_tokens:
        result = _whisper_only(whisper_words)
        result = _detect_phrase_boundaries(result)
        return result

    aligned = _correct_with_external(whisper_words, external_tokens)
    aligned = _detect_phrase_boundaries(aligned)

    corrections = sum(1 for w in aligned if w.get("corrected"))
    logger.info(
        f"Aligned: {len(whisper_words)} whisper words, {corrections} corrections from external"
    )
    return aligned


def _tokenize(text: str) -> list[str]:
    """Tokenize lyrics text into words."""
    tokens = []
    for line in text.split("\n"):
        for word in line.split():
            word = word.strip(".,!?;:()[]{}").lower()
            if word:
                tokens.append(word)
    return tokens


def _whisper_only(whisper_words: list[dict]) -> list[dict]:
    """Use Whisper words as-is (base transcription)."""
    if not whisper_words:
        return []
    result = []
    for w in whisper_words:
        result.append(
            {
                "word": w.get("word", ""),
                "start": round(w.get("start", 0), 3),
                "end": round(w.get("end", 0), 3),
                "is_phrase_start": False,
                "corrected": False,
            }
        )
    return result


def _correct_with_external(
    whisper_words: list[dict], external_tokens: list[str]
) -> list[dict]:
    """Use Whisper as base, correct words using fuzzy matching with external lyrics.

    Keeps Whisper timing, replaces words that look misrecognized.
    """
    result = []
    ext_idx = 0

    for ww in whisper_words:
        ww_word = ww.get("word", "").lower().strip(".,!?;:()")
        corrected = False
        new_word = ww_word

        if ext_idx < len(external_tokens):
            ext_token = external_tokens[ext_idx]
            similarity = _similarity(ww_word, ext_token)

            if similarity >= 0.3:
                for j in range(
                    max(0, ext_idx - 2), min(ext_idx + 3, len(external_tokens))
                ):
                    candidate = external_tokens[j]
                    score = _similarity(ww_word, candidate)
                    if score > similarity:
                        similarity = score

                if similarity >= 0.5:
                    new_word = external_tokens[ext_idx]
                    corrected = True
                    ext_idx += 1
                elif similarity >= 0.3:
                    ext_idx += 1
            else:
                ext_idx += 1
                while ext_idx < len(external_tokens):
                    next_ext = external_tokens[ext_idx]
                    sim = _similarity(ww_word, next_ext)
                    if sim >= 0.3:
                        break
                    ext_idx += 1

        result.append(
            {
                "word": new_word,
                "start": round(ww.get("start", 0), 3),
                "end": round(ww.get("end", 0), 3),
                "is_phrase_start": False,
                "corrected": corrected,
            }
        )

    return result


def _greedy_align(external_tokens: list[str], whisper_words: list[dict]) -> list[dict]:
    """Legacy function - kept for compatibility."""
    return _whisper_only(whisper_words)


def _similarity(a: str, b: str) -> float:
    """Calculate similarity between two tokens."""
    if not a or not b:
        return 0
    a_clean = re.sub(r"[^\w]", "", a.lower())
    b_clean = re.sub(r"[^\w]", "", b.lower())
    if not a_clean or not b_clean:
        return 0
    if a_clean == b_clean:
        return 1.0
    if a_clean in b_clean or b_clean in a_clean:
        return 0.8
    return 0


def _detect_phrase_boundaries(words: list[dict]) -> list[dict]:
    """Detect phrase/line boundaries based on punctuation and timing."""
    if not words:
        return words

    result = []
    phrase_count = 0

    for i, w in enumerate(words):
        word = w.get("word", "")
        is_phrase_start = False

        if i == 0:
            is_phrase_start = True
            phrase_count += 1
        elif i > 0:
            prev_end = words[i - 1].get("end", 0)
            curr_start = w.get("start", 0)
            gap = curr_start - prev_end
            if gap > 1.0:
                is_phrase_start = True
                phrase_count += 1
            elif word and len(word) > 2 and word[-1] in PHRASE_BREAK_PUNCTUATION:
                is_phrase_start = True
                phrase_count += 1
            elif phrase_count > 0 and phrase_count % 6 == 0 and gap > 0.5:
                is_phrase_start = True
                phrase_count += 1

        result.append({**w, "is_phrase_start": is_phrase_start})

    return result
