"""Lyrics detection using Whisper for word timestamps."""
import json
import logging
from pathlib import Path
from app.audio.lyrics_fetch import fetch_external_lyrics
from app.audio.lyrics_alignment import align_lyrics, _whisper_only

logger = logging.getLogger(__name__)

WHISPER_MODEL = "medium"

WHISPER_MODELS = {
    "medium": "medium",
    "kelvin": "kelvinbksoh/whisper-medium-vietnamese-lyrics-transcription",
    "vi": "medium",
    "en": "medium",
}

LANGUAGE_CODES = {
    "vi": "Vietnamese",
    "en": "English",
}


def _run_whisper_huggingface(model_id: str, audio_path: str, language: str | None = None) -> list[dict]:
    """Run HuggingFace Whisper in a subprocess so it can be killed on timeout."""
    import subprocess
    import sys
    from pathlib import Path

    worker_script = Path(__file__).parent / "hf_transcribe_worker.py"
    try:
        result = subprocess.run(
            [sys.executable, str(worker_script), model_id, audio_path, language or "vi"],
            capture_output=True,
            text=True,
            timeout=550,  # under the 600 s asyncio.wait_for so TimeoutExpired fires first
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("HuggingFace transcription timed out after 550 s") from exc

    if result.returncode != 0:
        stderr_tail = result.stderr[-500:] if result.stderr else ""
        raise RuntimeError(f"HF worker failed (exit {result.returncode}): {stderr_tail}")

    data = json.loads(result.stdout)
    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(data["error"])
    return data


def _run_whisper(song_dir: Path, language: str | None = None) -> list[dict]:
    """Run Whisper transcription (sync function to run in executor)."""
    vocals_path = song_dir / "stems" / "vocals.mp3"
    if not vocals_path.exists():
        return []

    import whisper

    model_name = WHISPER_MODELS.get(language, WHISPER_MODEL)

    if model_name.startswith("kelvin"):
        return _run_whisper_huggingface(model_name, str(vocals_path), "vi")

    model = whisper.load_model(model_name)
    result = whisper.transcribe(
        model,
        str(vocals_path),
        word_timestamps=True,
        language="vi" if language == "kelvin" else (language if language and language != "auto" else None),
        condition_on_previous_text=False,
    )

    words = []
    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            words.append({
                "word": word_info.get("word", "").strip(),
                "start": round(word_info.get("start", 0), 3),
                "end": round(word_info.get("end", 0), 3),
            })
    return words


def _title_to_slug(title: str) -> str:
    import re
    words = title.split()[:5]
    return "-".join(re.sub(r"[^\w]", "", w).lower() for w in words) or "lyrics"


def _build_chord_timeline(chords_data: dict) -> list[tuple[float, str]]:
    sections = {s["index"]: s for s in chords_data.get("sections", [])}
    timeline: list[tuple[float, str]] = []
    for measure in chords_data.get("measures", []):
        measure_start = measure["start"]
        section = sections.get(measure.get("section_index", 0), {})
        beat_dur = section.get("beat_duration", 0.5)
        for entry in measure.get("chords", []):
            chord = entry.get("chord", "")
            if chord:
                t = round(measure_start + (entry.get("beat", 1) - 1) * beat_dur, 3)
                timeline.append((t, chord))
    timeline.sort(key=lambda x: x[0])
    return timeline


def _format_lyrics_with_chords(words: list[dict], chord_timeline: list[tuple[float, str]]) -> str:
    # Split words into phrases, then detect passage breaks (gap > 2 s between phrases).
    phrases: list[list[dict]] = []
    current: list[dict] = []
    for entry in words:
        if entry.get("is_phrase_start") and current:
            phrases.append(current)
            current = []
        current.append(entry)
    if current:
        phrases.append(current)

    chord_idx = 0
    last_chord: str | None = None
    output_lines: list[str] = []

    for p_idx, phrase in enumerate(phrases):
        # Passage break: gap > 2 s from end of previous phrase
        if p_idx > 0:
            prev_end = phrases[p_idx - 1][-1]["end"]
            curr_start = phrase[0]["start"]
            if curr_start - prev_end > 2.0:
                output_lines.append("")  # blank line = paragraph break

        parts: list[str] = []
        for entry in phrase:
            word = entry["word"]
            word_start = entry["start"]

            new_chord: str | None = None
            while chord_idx < len(chord_timeline) and chord_timeline[chord_idx][0] <= word_start:
                new_chord = chord_timeline[chord_idx][1]
                chord_idx += 1

            if new_chord and new_chord != last_chord:
                parts.append(f"[{new_chord}] {word}")
                last_chord = new_chord
            else:
                parts.append(word)

        output_lines.append(" ".join(parts))

    return "\n".join(output_lines)


def _save_lyrics_md(song_dir: Path, title: str, artist: str | None, lyrics_data: dict) -> None:
    chords_path = song_dir / "chords.json"
    chord_timeline: list[tuple[float, str]] = []
    chords_meta: dict = {}
    if chords_path.exists():
        chords_meta = json.loads(chords_path.read_text())
        chord_timeline = _build_chord_timeline(chords_meta)

    words = lyrics_data.get("words", [])
    source = lyrics_data.get("source", "")

    lyrics_body = _format_lyrics_with_chords(words, chord_timeline)

    meta_lines = []
    if artist:
        meta_lines.append(f"**Artist:** {artist}")
    if chords_meta.get("key"):
        meta_lines.append(f"**Key:** {chords_meta['key']}")
    if chords_meta.get("global_tempo"):
        meta_lines.append(f"**Tempo:** {chords_meta['global_tempo']} BPM")
    if source:
        meta_lines.append(f"**Source:** {source}")

    slug = _title_to_slug(title)
    md_path = song_dir / f"{slug}.md"
    md_content = f"### {title}\n"
    if meta_lines:
        md_content += "\n".join(meta_lines) + "\n"
    md_content += f"\n#### Lyrics:\n{lyrics_body}\n"
    md_path.write_text(md_content, encoding="utf-8")
    logger.info(f"Saved lyrics MD to {md_path.name}")


async def save_lyrics(
    song_dir: Path,
    title: str,
    artist: str | None = None,
    youtube_url: str | None = None,
    language: str = "vi",
) -> bool:
    """Run Whisper for timing, try to correct with external lyrics."""
    import asyncio

    try:
        whisper_words = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _run_whisper, song_dir, language),
            timeout=600,
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
                from app.audio.lyrics_alignment import _detect_phrase_boundaries
                final_words = _whisper_only(whisper_words)
                final_words = _detect_phrase_boundaries(final_words)
        else:
            from app.audio.lyrics_alignment import _detect_phrase_boundaries
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

        try:
            _save_lyrics_md(song_dir, title, artist, lyrics_data)
        except Exception as md_exc:
            logger.warning(f"Failed to write lyrics MD (non-fatal): {md_exc}")

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