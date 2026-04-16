"""Song analysis: tempo, key, and measure-level chord detection.

Measures are timed from the first detected beat using the median inter-beat
interval, so measure boundaries align mathematically with the audio grid.
Each measure gets one or two chords depending on whether a chord change occurs
mid-measure.

When separated stems are available (bass, guitar, other), the detector uses
them instead of the full mix for cleaner harmonic analysis.  The bass stem
is analysed separately to provide a root-note prior that disambiguates
chords sharing the same pitch classes (e.g. Am vs C).
"""

import json
import subprocess
from pathlib import Path

import numpy as np


_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Chord quality templates (pitch-class vectors, root at index 0)
_TEMPLATES: dict[str, np.ndarray] = {
    "":    np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], dtype=float),  # major
    "m":   np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float),  # minor
    "7":   np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], dtype=float),  # dom7
    "maj7":np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1], dtype=float),  # maj7
    "m7":  np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0], dtype=float),  # min7
    "sus2":np.array([1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float),  # sus2
    "sus4":np.array([1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0], dtype=float),  # sus4
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
    )
    if len(result.stdout) < 4:
        raise RuntimeError(f"ffmpeg returned no audio from {path}")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def _load_stems_mix(song_dir: Path, sr: int = 22050) -> np.ndarray | None:
    """Load bass + guitar + other stems and mix them.  Returns None if unavailable."""
    stems_dir = song_dir / "stems"
    stem_files = [stems_dir / f"{s}.mp3" for s in ("bass", "guitar", "other")]
    if not all(f.exists() for f in stem_files):
        return None
    arrays = [_load_audio_ffmpeg(f, sr) for f in stem_files]
    # Align lengths (stems should be equal, but be safe)
    min_len = min(len(a) for a in arrays)
    mixed = sum(a[:min_len] for a in arrays) / len(arrays)
    return mixed


def _load_bass_audio(song_dir: Path, sr: int = 22050) -> np.ndarray | None:
    """Load just the bass stem for root detection."""
    bass_path = song_dir / "stems" / "bass.mp3"
    if not bass_path.exists():
        return None
    return _load_audio_ffmpeg(bass_path, sr)


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
    """Analyse audio and return measure-level chord data.

    Prefers separated stems (bass+guitar+other) over the full mix for
    cleaner harmonic analysis.  Uses the bass stem separately to detect
    the root note as a prior for chord matching.

    Returns a dict with keys: tempo, time_signature, key, beat_duration,
    measure_duration, measures.  Each measure has: index, start, end, chords
    (list of 1-2 {chord, beat} entries).
    """
    import librosa

    sr = 22050
    hop_length = 512  # ~23 ms

    # Try stems first, fall back to original.wav + HPSS
    stems_mix = _load_stems_mix(song_dir, sr)
    bass_audio = _load_bass_audio(song_dir, sr)

    if stems_mix is not None:
        y_harmonic = stems_mix  # already drums/vocals-free
        # Still need full audio for beat tracking (drums help)
        wav_path = song_dir / "original.wav"
        if wav_path.exists():
            y_full = _load_audio_ffmpeg(wav_path, sr)
        else:
            y_full = stems_mix
    else:
        wav_path = song_dir / "original.wav"
        if not wav_path.exists():
            raise FileNotFoundError(f"No audio found in {song_dir}")
        y_full = _load_audio_ffmpeg(wav_path, sr)
        y_harmonic, _ = librosa.effects.hpss(y_full)

    duration = len(y_full) / sr

    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=hop_length)

    # Bass chroma for root detection
    bass_chroma = None
    if bass_audio is not None:
        bass_chroma = librosa.feature.chroma_cqt(y=bass_audio, sr=sr, hop_length=hop_length)

    # Beat tracking (use full mix — drums help beat detection)
    _, beat_frames = librosa.beat.beat_track(y=y_full, sr=sr, hop_length=hop_length)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)

    # Stable beat duration: median inter-beat interval (used for tempo + fallback)
    beat_list: list[float] = [float(bt) for bt in beat_times]
    if len(beat_list) >= 2:
        beat_duration = float(np.median(np.diff(beat_list)))
    else:
        beat_duration = 0.5  # fallback

    tempo = 60.0 / beat_duration
    time_sig = 4  # assume 4/4
    measure_duration = beat_duration * time_sig

    # Key
    key = _detect_key(chroma)

    # Build measure boundaries anchored to actual detected beat times.
    # This prevents drift: a constant-duration grid accumulates error over the
    # song; grouping every time_sig beats keeps measure boundaries accurate.
    measure_bounds: list[tuple[float, float]] = []

    if len(beat_list) >= time_sig:
        first_beat = beat_list[0]
        intro_start = max(0.0, first_beat - measure_duration)
        # Prepend an intro measure when there is meaningful pre-beat audio
        if intro_start < first_beat - 0.05:
            measure_bounds.append((intro_start, first_beat))

        n_full = len(beat_list) // time_sig
        for i in range(n_full):
            m_start = beat_list[i * time_sig]
            next_idx = (i + 1) * time_sig
            if next_idx < len(beat_list):
                m_end = beat_list[next_idx]
            else:
                # Extrapolate end of last full measure from its own beat spacing
                grp = beat_list[i * time_sig:]
                last_iv = (grp[-1] - grp[0]) / (len(grp) - 1) if len(grp) > 1 else beat_duration
                m_end = grp[-1] + last_iv
            measure_bounds.append((m_start, m_end))

        # Trailing partial measure (fewer than time_sig beats remaining)
        trailing = n_full * time_sig
        if trailing < len(beat_list):
            measure_bounds.append((beat_list[trailing], beat_list[trailing] + measure_duration))
    else:
        # Fallback: constant-duration grid when too few beats detected
        t0 = beat_list[0] if beat_list else 0.0
        grid_start = max(0.0, t0 - measure_duration)
        t = grid_start
        while t < duration:
            measure_bounds.append((t, t + measure_duration))
            t += measure_duration

    frames_per_sec = sr / hop_length

    measures = []
    for idx, (m_start, m_end) in enumerate(measure_bounds):
        # Divide the measure into time_sig beats using its actual duration
        m_beat_dur = (m_end - m_start) / time_sig

        # Analyze each beat
        beat_chords: list[str] = []
        for b in range(time_sig):
            b_start = m_start + b * m_beat_dur
            b_end = m_start + (b + 1) * m_beat_dur
            f0 = int(b_start * frames_per_sec)
            f1 = int(b_end * frames_per_sec)

            # Get bass root prior for this beat
            bass_root = None
            if bass_chroma is not None:
                bass_root = _detect_bass_root(bass_chroma, f0, f1)

            beat_chords.append(_best_chord(chroma[:, f0:f1], bass_root))

        # Build chord entries: beat 1 always included; mid-measure changes
        # only recorded when the chord holds for 2+ beats (noise filter).
        chord_entries: list[dict] = []
        prev = None
        prev_beat = 1
        for b, chord in enumerate(beat_chords, start=1):
            if chord != prev:
                if prev is not None:
                    if b == 1 or (b - prev_beat) >= 2:
                        chord_entries.append({"chord": prev, "beat": prev_beat})
                prev = chord
                prev_beat = b
        if prev is not None and (time_sig - prev_beat + 1) >= 2:
            chord_entries.append({"chord": prev, "beat": prev_beat})
        if beat_chords and not any(e["beat"] == 1 for e in chord_entries):
            chord_entries.insert(0, {"chord": beat_chords[0], "beat": 1})

        measures.append({"index": idx, "start": round(m_start, 3), "end": round(m_end, 3), "chords": chord_entries})

    return {
        "tempo": round(tempo, 1),
        "time_signature": time_sig,
        "key": key,
        "beat_duration": round(beat_duration, 4),
        "measure_duration": round(measure_duration, 4),
        "measures": measures,
    }


def save_chords(song_dir: Path) -> None:
    """Detect chords and write chords.json. Writes an error marker on failure."""
    try:
        data = detect_chords(song_dir)
        (song_dir / "chords.json").write_text(json.dumps(data))
    except Exception as exc:
        (song_dir / "chords.json").write_text(
            json.dumps(
                {
                    "error": str(exc),
                    "tempo": 0.0,
                    "time_signature": 4,
                    "key": "?",
                    "beat_duration": 0.0,
                    "measure_duration": 0.0,
                    "measures": [],
                }
            )
        )
