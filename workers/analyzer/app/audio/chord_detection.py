"""Song analysis: tempo, key, and measure-level chord detection.

Beat and downbeat detection is delegated to beat_tracking.detect_beats_and_sections
(madmom-powered).  Each measure spans one downbeat interval and gets one or two
chords depending on whether a chord change occurs mid-measure.

When separated stems are available (bass, guitar, other), the detector uses
them instead of the full mix for cleaner harmonic analysis.  The bass stem
is analysed separately to provide a root-note prior that disambiguates
chords sharing the same pitch classes (e.g. Am vs C).
"""

import json
import logging
import subprocess
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Chord quality templates (pitch-class vectors, root at index 0)
_TEMPLATES: dict[str, np.ndarray] = {
    "": np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], dtype=float),  # major
    "m": np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float),  # minor
    "7": np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], dtype=float),  # dom7
    "maj7": np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1], dtype=float),  # maj7
    "m7": np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0], dtype=float),  # min7
    "sus2": np.array([1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float),  # sus2
    "sus4": np.array([1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0], dtype=float),  # sus4
    "dim": np.array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0], dtype=float),  # dim
    "aug": np.array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], dtype=float),  # aug
}

# Preference order: when two templates score within _TIEBREAK_THRESHOLD,
# prefer the simpler (lower index) chord quality.
_QUALITY_PREFERENCE = ["", "m", "7", "m7", "maj7", "sus4", "sus2", "dim", "aug"]
_TIEBREAK_THRESHOLD = 0.05
_MIN_CHORD_SCORE = 0.5

# Krumhansl-Schmuckler key profiles
_KS_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_KS_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def _build_chord_templates() -> tuple[list[str], list[int], np.ndarray]:
    """Build (names, quality_pref_indices, normalised matrix) for all templates."""
    names: list[str] = []
    pref_indices: list[int] = []
    vecs: list[np.ndarray] = []
    for quality in _QUALITY_PREFERENCE:
        template = _TEMPLATES[quality]
        pref_idx = _QUALITY_PREFERENCE.index(quality)
        for i, note in enumerate(_NOTES):
            suffix = quality
            names.append(f"{note}{suffix}")
            pref_indices.append(pref_idx)
            vecs.append(np.roll(template, i))
    matrix = np.stack(vecs, axis=0).astype(float)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms < 1e-10] = 1.0
    return names, pref_indices, matrix / norms


_CHORD_NAMES, _CHORD_PREF, _CHORD_MATRIX = _build_chord_templates()


def _load_audio_ffmpeg(path: Path, sr: int = 22050) -> np.ndarray:
    result = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(path),
            "-f",
            "f32le",
            "-ar",
            str(sr),
            "-ac",
            "1",
            "pipe:1",
        ],
        capture_output=True,
        timeout=300,  # 5-minute hard limit per file
    )
    if len(result.stdout) < 4:
        raise RuntimeError(f"ffmpeg returned no audio from {path}")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def _load_stems_mix(song_dir: Path, sr: int = 22050) -> np.ndarray | None:
    """Load harmonic stems and mix them.  Returns None if unavailable.

    Prefers bass+guitar+other (6-stem model).  Falls back to bass+other
    (4-stem htdemucs model which has no guitar stem).
    """
    stems_dir = song_dir / "stems"
    # Try 6-stem layout first (bass + guitar + other)
    preferred = [stems_dir / f"{s}.mp3" for s in ("bass", "guitar", "other")]
    if all(f.exists() for f in preferred):
        stem_files = preferred
    else:
        # 4-stem fallback: bass + other (no guitar)
        fallback = [stems_dir / f"{s}.mp3" for s in ("bass", "other")]
        if not all(f.exists() for f in fallback):
            return None
        stem_files = fallback
    arrays = [_load_audio_ffmpeg(f, sr) for f in stem_files]
    min_len = min(len(a) for a in arrays)
    mixed = sum(a[:min_len] for a in arrays) / len(arrays)
    return mixed


def _load_bass_audio(song_dir: Path, sr: int = 22050) -> np.ndarray | None:
    """Load just the bass stem for root detection."""
    bass_path = song_dir / "stems" / "bass.mp3"
    if not bass_path.exists():
        return None
    return _load_audio_ffmpeg(bass_path, sr)


def _load_drums_audio(song_dir: Path, sr: int = 22050) -> np.ndarray | None:
    """Load just the drums stem for kick-drum energy analysis."""
    drums_path = song_dir / "stems" / "drums.mp3"
    if not drums_path.exists():
        return None
    return _load_audio_ffmpeg(drums_path, sr)


def _load_beats_mix(song_dir: Path, sr: int = 22050) -> np.ndarray | None:
    """Load a beat-optimised mix (all stems) for reliable beat tracking.

    Using all four stems reconstructs the full audio signal, giving the beat
    tracker the same information as original.wav without loading the large
    uncompressed file.  Vocals are included because many songs have vocal-only
    passages where drums/bass drop out entirely.
    """
    stems_dir = song_dir / "stems"
    candidates = [stems_dir / f"{s}.mp3" for s in ("drums", "bass", "other", "vocals")]
    available = [p for p in candidates if p.exists()]
    if not available:
        return None
    arrays = [_load_audio_ffmpeg(p, sr) for p in available]
    min_len = min(len(a) for a in arrays)
    return sum(a[:min_len] for a in arrays) / len(arrays)


def _snap_beats_to_onsets(
    beat_frames: np.ndarray, onset_env: np.ndarray, window: int = 4
) -> np.ndarray:
    """Snap each beat frame to the nearest onset peak within ±window frames.

    Corrects quantisation error from the hop-length grid.  Collisions (two
    beats snapping to the same frame) are resolved by reverting the later beat
    to its pre-snap position — never worse than the current behaviour.
    """
    if len(beat_frames) == 0:
        return beat_frames
    n = len(onset_env)
    snapped: list[int] = []
    for f in beat_frames:
        lo = max(0, int(f) - window)
        hi = min(n - 1, int(f) + window)
        local_max = lo + int(np.argmax(onset_env[lo : hi + 1]))
        snapped.append(local_max)
    # Resolve collisions: revert the later beat to its original frame so
    # np.diff(beat_list) never produces 0, avoiding division-by-zero in tempo.
    result = list(snapped)
    for i in range(1, len(result)):
        if result[i] <= result[i - 1]:
            result[i] = int(beat_frames[i])
    return np.array(result, dtype=int)


def _detect_bass_root(bass_chroma: np.ndarray, f0: int, f1: int) -> int | None:
    """Return the dominant pitch class (0-11) from the bass chroma in the given frame range."""
    if f1 <= f0 or f0 >= bass_chroma.shape[1]:
        return None
    f1 = min(f1, bass_chroma.shape[1])
    profile = np.median(bass_chroma[:, f0:f1], axis=1)
    if float(np.max(profile)) < 1e-3:
        return None
    return int(np.argmax(profile))


def _best_chord(chroma_slice: np.ndarray, bass_root: int | None = None) -> str:
    """Return the best-matching chord name for a (12, n_frames) chroma slice.

    When bass_root is provided, it biases the match toward chords whose root
    matches the bass note, breaking ambiguities like Am vs C.
    """
    if chroma_slice.shape[1] == 0:
        return "N"
    profile = np.median(chroma_slice, axis=1)
    norm = float(np.linalg.norm(profile))
    if norm < 1e-3:
        return "N"
    profile = profile / norm

    scores = profile @ _CHORD_MATRIX.T  # shape: (n_templates,)

    # Apply bass-root bonus: boost templates whose root matches the bass
    if bass_root is not None:
        for idx in range(len(_CHORD_NAMES)):
            # Template root = idx % 12 (templates cycle through 12 notes per quality)
            template_root = idx % 12
            if template_root == bass_root:
                scores[idx] += 0.15  # root-match bonus

    best_idx = int(np.argmax(scores))
    best_score = scores[best_idx]

    if best_score < _MIN_CHORD_SCORE:
        return "N"

    # Tiebreak: if a simpler chord scores close to the best, prefer it
    for idx in range(len(scores)):
        if idx == best_idx:
            continue
        if scores[idx] >= best_score - _TIEBREAK_THRESHOLD:
            if _CHORD_PREF[idx] < _CHORD_PREF[best_idx]:
                best_idx = idx
                best_score = scores[idx]

    return _CHORD_NAMES[best_idx]


def _detect_key(chroma: np.ndarray) -> str:
    """Detect musical key using Krumhansl-Schmuckler profiles."""
    profile = np.mean(chroma, axis=1)
    best_r, best_key = -2.0, "C"
    for i, note in enumerate(_NOTES):
        for template, suffix in [(_KS_MAJOR, ""), (_KS_MINOR, "m")]:
            r = float(np.corrcoef(profile, np.roll(template, i))[0, 1])
            if r > best_r:
                best_r, best_key = r, f"{note}{suffix}"
    return best_key




def detect_chords(song_dir: Path) -> dict:
    """Analyse audio and return schema-v2 measure-level chord data.

    Prefers separated stems (bass+guitar+other) over the full mix for
    cleaner harmonic analysis.  Uses the bass stem separately to detect
    the root note as a prior for chord matching.  Beat/downbeat/section
    detection is handled by beat_tracking.detect_beats_and_sections (madmom).
    """
    import librosa

    from app.audio.beat_tracking import detect_beats_and_sections

    sr = 22050
    hop_length = 512  # ~23 ms

    stems_mix = _load_stems_mix(song_dir, sr)
    bass_audio = _load_bass_audio(song_dir, sr)

    wav_path = song_dir / "original.wav"

    if stems_mix is not None:
        y_harmonic = stems_mix
        duration = len(stems_mix) / sr
    else:
        if not wav_path.exists():
            raise FileNotFoundError(f"No audio found in {song_dir}")
        y_full = _load_audio_ffmpeg(wav_path, sr)
        y_harmonic, _ = librosa.effects.hpss(y_full)
        duration = len(y_full) / sr

    chroma = librosa.feature.chroma_stft(
        y=y_harmonic, sr=sr, hop_length=hop_length, n_fft=4096
    )

    bass_chroma = None
    if bass_audio is not None:
        bass_chroma = librosa.feature.chroma_stft(
            y=bass_audio, sr=sr, hop_length=hop_length, n_fft=4096
        )

    key = _detect_key(chroma)

    # Beat/downbeat/section detection — single path, no fallback
    beat_src = wav_path if wav_path.exists() else None
    if beat_src is None:
        raise FileNotFoundError(f"original.wav not found in {song_dir}")

    rhythmic = detect_beats_and_sections(beat_src)
    beat_times: list[float] = rhythmic["beat_times"]
    downbeat_times: list[float] = rhythmic["downbeat_times"]
    sections: list[dict] = rhythmic["sections"]

    logger.info(
        "Beat detection: %d beats, %d downbeats, %d sections",
        len(beat_times), len(downbeat_times), len(sections),
    )

    # Global tempo = median of section tempos weighted by section duration
    if sections:
        total_dur = sum(s["end"] - s["start"] for s in sections)
        global_tempo = (
            sum((s["end"] - s["start"]) * s["tempo"] for s in sections) / total_dur
            if total_dur > 0 else 120.0
        )
    elif beat_times:
        intervals = np.diff(beat_times)
        global_tempo = 60.0 / float(np.median(intervals)) if len(intervals) > 0 else 120.0
    else:
        global_tempo = 120.0

    # Tempo profile and stability from sections
    tempo_profile = [
        {"time": round(s["start"], 2), "bpm": round(s["tempo"], 1)}
        for s in sections
    ]
    if len(tempo_profile) == 0 and beat_times:
        tempo_profile = [{"time": 0.0, "bpm": round(global_tempo, 1)}]

    if len(sections) >= 2:
        tempos = [s["tempo"] for s in sections]
        std = float(np.std(tempos))
        tempo_stability: str = "stable" if std < 2 else "moderate" if std < 5 else "variable"
    else:
        tempo_stability = "stable"

    # Build measures from consecutive downbeat pairs
    frames_per_sec = sr / hop_length

    # Resolve which section each downbeat belongs to
    def _section_for_time(t: float) -> int:
        for s in sections:
            if s["start"] <= t < s["end"]:
                return s["index"]
        return sections[-1]["index"] if sections else 0

    measures: list[dict] = []
    measure_idx = 0

    if len(downbeat_times) >= 2:
        for i in range(len(downbeat_times) - 1):
            m_start = downbeat_times[i]
            m_end = downbeat_times[i + 1]
            sec_idx = _section_for_time(m_start)
            sec = sections[sec_idx] if sec_idx < len(sections) else None
            time_sig_num = sec["time_sig"]["num"] if sec else 4

            m_duration = m_end - m_start
            m_beat_dur = m_duration / time_sig_num if time_sig_num > 0 else m_duration

            beat_chords: list[str] = []
            for b in range(time_sig_num):
                b_start = m_start + b * m_beat_dur
                b_end = m_start + (b + 1) * m_beat_dur
                f0 = int(b_start * frames_per_sec)
                f1 = int(b_end * frames_per_sec)
                bass_root = _detect_bass_root(bass_chroma, f0, f1) if bass_chroma is not None else None
                beat_chords.append(_best_chord(chroma[:, f0:f1], bass_root))

            measures.append({
                "index": measure_idx,
                "start": round(m_start, 3),
                "end": round(m_end, 3),
                "section_index": sec_idx,
                "chords": _compress_beat_chords(beat_chords, time_sig_num),
            })
            measure_idx += 1

        # Final partial measure
        if sections:
            last_sec = sections[_section_for_time(downbeat_times[-1])]
            last_measure_dur = last_sec["measure_duration"]
        else:
            last_measure_dur = 60.0 / global_tempo * 4
        last_start = downbeat_times[-1]
        last_end = last_start + last_measure_dur
        last_sec_idx = _section_for_time(last_start)
        measures.append({
            "index": measure_idx,
            "start": round(last_start, 3),
            "end": round(last_end, 3),
            "section_index": last_sec_idx,
            "chords": [{"chord": "N", "beat": 1}],
        })
    else:
        # No downbeats detected: fallback constant-duration grid
        fallback_dur = 60.0 / global_tempo * 4
        t = 0.0
        while t < duration:
            measures.append({
                "index": measure_idx,
                "start": round(t, 3),
                "end": round(t + fallback_dur, 3),
                "section_index": 0,
                "chords": [{"chord": "N", "beat": 1}],
            })
            measure_idx += 1
            t += fallback_dur

    return {
        "schema_version": 2,
        "key": key,
        "duration": round(duration, 3),
        "global_tempo": round(global_tempo, 1),
        "tempo_stability": tempo_stability,
        "tempo_profile": tempo_profile,
        "sections": sections,
        "beat_times": beat_times,
        "downbeat_times": downbeat_times,
        "measures": measures,
    }


def _chord_at_time(old_measures: list[dict], time: float, time_sig: int) -> str:
    """Return the chord playing at *time* by looking it up in the existing measure data."""
    for m in old_measures:
        if m["start"] <= time < m["end"]:
            m_dur = m["end"] - m["start"]
            if m_dur <= 0:
                continue
            beat_frac = (time - m["start"]) / m_dur * time_sig  # 0-indexed float
            beat_1indexed = int(beat_frac) + 1  # 1-indexed, clamped below
            beat_1indexed = max(1, min(beat_1indexed, time_sig))
            current_chord = "N"
            for entry in sorted(m["chords"], key=lambda e: e["beat"]):
                if entry["beat"] <= beat_1indexed:
                    current_chord = entry["chord"]
                else:
                    break
            return current_chord
    return "N"


def _compress_beat_chords(beat_chords: list[str], time_sig: int) -> list[dict]:
    """Compress a per-beat chord list to {chord, beat} entries (1-indexed).

    Mirrors the compression logic in detect_chords: beat 1 is always present;
    mid-measure changes are recorded only when the chord holds for 2+ beats.
    """
    entries: list[dict] = []
    prev: str | None = None
    prev_beat = 1

    for b, chord in enumerate(beat_chords, start=1):
        if chord != prev:
            if prev is not None:
                if prev_beat == 1 or (b - prev_beat) >= 2:
                    entries.append({"chord": prev, "beat": prev_beat})
            prev = chord
            prev_beat = b

    if prev is not None:
        remaining = len(beat_chords) - prev_beat + 1
        if remaining >= 2:
            entries.append({"chord": prev, "beat": prev_beat})

    if beat_chords and not any(e["beat"] == 1 for e in entries):
        entries.insert(0, {"chord": beat_chords[0], "beat": 1})

    return entries if entries else [{"chord": "N", "beat": 1}]


def rebuild_measures_for_section_timesig(data: dict, section_idx: int, num: int, den: int) -> dict:
    """Rebuild measures for one section after a manual time-signature override.

    Updates sections[section_idx].time_sig/beat_duration/measure_duration, then
    rebuilds downbeat_times and measures[] for that section only.  All other
    sections are left untouched.
    """
    sections: list[dict] = data.get("sections", [])
    if section_idx >= len(sections):
        return data

    sec = sections[section_idx]
    beat_duration = sec["beat_duration"]
    new_measure_duration = beat_duration * num

    sec["time_sig"] = {"num": num, "den": den}
    sec["measure_duration"] = round(new_measure_duration, 5)

    # Rebuild downbeat grid for this section from first_downbeat
    first_db = sec.get("first_downbeat", sec["start"])
    new_downbeats: list[float] = []
    t = first_db
    while t < sec["end"]:
        new_downbeats.append(round(t, 4))
        t += new_measure_duration

    # Replace downbeat_times entries that fall inside this section
    all_downbeats: list[float] = data.get("downbeat_times", [])
    outside = [d for d in all_downbeats if not (sec["start"] <= d < sec["end"])]
    merged_downbeats = sorted(outside + new_downbeats)
    data["downbeat_times"] = merged_downbeats

    # Rebuild measures[] for this section; preserve others
    old_measures: list[dict] = data.get("measures", [])
    kept = [m for m in old_measures if m.get("section_index") != section_idx]

    new_measures: list[dict] = []
    for i in range(len(new_downbeats) - 1):
        m_start = new_downbeats[i]
        m_end = new_downbeats[i + 1]
        beat_chords = [
            _chord_at_time(old_measures, m_start + (b + 0.5) * (m_end - m_start) / num, num)
            for b in range(num)
        ]
        new_measures.append({
            "index": 0,  # re-indexed below
            "start": round(m_start, 3),
            "end": round(m_end, 3),
            "section_index": section_idx,
            "chords": _compress_beat_chords(beat_chords, num),
        })

    all_measures = sorted(kept + new_measures, key=lambda m: m["start"])
    for i, m in enumerate(all_measures):
        m["index"] = i

    data["measures"] = all_measures
    return data


def save_chords(song_dir: Path) -> bool:
    """Detect chords and write chords.json.

    Returns True on success. On failure, logs the error and leaves chords.json
    absent so the next request can trigger a fresh attempt.
    """
    import logging

    logger = logging.getLogger(__name__)
    try:
        data = detect_chords(song_dir)
        (song_dir / "chords.json").write_text(json.dumps(data))
        return True
    except Exception as exc:
        logger.warning(f"Chord detection failed for {song_dir}: {exc}")
        return False
