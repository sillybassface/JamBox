import json
from pathlib import Path
import whisper
import numpy as np


def save_lyrics(song_dir: Path) -> bool:
    """Run Whisper on vocals stem to generate word-level timestamps.

    Returns True on success, False on failure.
    """
    vocals_path = song_dir / "stems" / "vocals.mp3"
    if not vocals_path.exists():
        return False

    try:
        model = whisper.load_model("base")

        result = whisper.transcribe(
            model,
            str(vocals_path),
            word_timestamps=True,
            language=None,
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

        if not words:
            return False

        lyrics_path = song_dir / "lyrics.json"
        lyrics_path.write_text(json.dumps({"words": words}, indent=2))
        return True

    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(f"Lyrics detection failed: {e}")
        return False
