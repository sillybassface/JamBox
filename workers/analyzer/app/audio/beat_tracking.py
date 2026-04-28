"""Joint beat/downbeat/section detection via madmom.

Single detection path — no fallback tiers.  If madmom fails, the exception
propagates to save_chords which logs and returns False.
"""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


def detect_beats_and_sections(audio_path: Path) -> dict:
    """Detect beats, downbeats, and song sections from an audio file.

    Returns:
        {
            'beat_times': list[float],
            'downbeat_times': list[float],
            'sections': list[dict]  # each has index/start/end/tempo/time_sig/
                                    # beat_duration/measure_duration/first_downbeat/confidence
        }
    """
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor, RNNDownBeatProcessor

    from app.audio.chord_detection import _snap_beats_to_onsets

    act = RNNDownBeatProcessor()(str(audio_path))
    proc = DBNDownBeatTrackingProcessor(beats_per_bar=[2, 3, 4, 6, 7], fps=100)
    beats = proc(act)  # shape (N, 2): col0=time, col1=bar_position

    if len(beats) == 0:
        raise RuntimeError(f"madmom returned no beats for {audio_path}")

    beat_times_raw = beats[:, 0].astype(float)
    bar_positions = beats[:, 1].astype(int)

    # Snap beat times to nearby onset peaks (±40 ms = ~2 frames at hop=256, sr=22050)
    try:
        import librosa
        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        hop_length = 256
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        beat_frames = librosa.time_to_frames(beat_times_raw, sr=sr, hop_length=hop_length)
        # window=4 frames ≈ 4 * 256/22050 ≈ 46 ms — close to the ±40 ms target
        snapped_frames = _snap_beats_to_onsets(beat_frames, onset_env, window=4)
        beat_times = librosa.frames_to_time(snapped_frames, sr=sr, hop_length=hop_length).tolist()
    except Exception:
        beat_times = beat_times_raw.tolist()

    downbeat_mask = bar_positions == 1
    downbeat_times = beat_times_raw[downbeat_mask].tolist()

    sections = _segment_into_sections(beat_times, bar_positions)

    return {
        "beat_times": [round(t, 4) for t in beat_times],
        "downbeat_times": [round(t, 4) for t in downbeat_times],
        "sections": sections,
    }


def _segment_into_sections(beat_times: list, bar_positions: np.ndarray) -> list[dict]:
    """Group beats into bars, then segment into sections by tempo/meter change.

    Change-point rules:
      - Numerator change → new section immediately.
      - Tempo change: |Δ| > 8 BPM sustained ≥ 4 bars → new section.
    Sections < 12 s are merged into their longer neighbour.
    """
    if len(beat_times) == 0:
        return []

    # Group beats into bars (groups delimited by bar_position == 1)
    bars: list[dict] = []
    current_bar: list[int] = []

    for i, pos in enumerate(bar_positions):
        if pos == 1 and current_bar:
            bars.append({"beat_indices": current_bar})
            current_bar = [i]
        else:
            current_bar.append(i)
    if current_bar:
        bars.append({"beat_indices": current_bar})

    if not bars:
        return []

    # Per-bar metrics
    for bar in bars:
        idxs = bar["beat_indices"]
        times = [beat_times[i] for i in idxs]
        bar["num"] = max(bar_positions[idxs]) if len(idxs) > 0 else 4
        bar["start_time"] = times[0]
        bar["end_time"] = times[-1]
        if len(times) >= 2:
            bar["tempo"] = 60.0 * bar["num"] / (times[-1] - times[0])
        else:
            bar["tempo"] = 120.0

    # Find change-points
    boundaries = [0]
    pending_tempo_change = 0  # count of consecutive bars with big Δtempo

    for i in range(1, len(bars)):
        num_changed = bars[i]["num"] != bars[i - 1]["num"]
        delta_bpm = abs(bars[i]["tempo"] - bars[i - 1]["tempo"])

        if num_changed:
            boundaries.append(i)
            pending_tempo_change = 0
        elif delta_bpm > 8:
            pending_tempo_change += 1
            if pending_tempo_change >= 4:
                boundaries.append(i - 3)  # retroactively mark where change started
                pending_tempo_change = 0
        else:
            pending_tempo_change = 0

    boundaries.append(len(bars))
    boundaries = sorted(set(boundaries))

    # Build raw sections
    raw_sections = []
    for si in range(len(boundaries) - 1):
        b_start = boundaries[si]
        b_end = boundaries[si + 1]
        section_bars = bars[b_start:b_end]
        if not section_bars:
            continue

        start_time = section_bars[0]["start_time"]
        end_time = section_bars[-1]["end_time"]
        duration = end_time - start_time
        tempos = [b["tempo"] for b in section_bars]
        median_tempo = float(np.median(tempos))
        numerator = int(np.median([b["num"] for b in section_bars]))

        raw_sections.append({
            "start": start_time,
            "end": end_time,
            "duration": duration,
            "tempo": median_tempo,
            "num": numerator,
        })

    # Merge sections shorter than 12 s into longer neighbour
    MIN_SECTION_DUR = 12.0
    merged = list(raw_sections)
    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(merged):
            if merged[i]["duration"] < MIN_SECTION_DUR and len(merged) > 1:
                # Merge with the longer adjacent neighbour
                if i == 0:
                    neighbour = 1
                elif i == len(merged) - 1:
                    neighbour = i - 1
                else:
                    left_dur = merged[i - 1]["duration"]
                    right_dur = merged[i + 1]["duration"]
                    neighbour = i - 1 if left_dur >= right_dur else i + 1

                lo, hi = min(i, neighbour), max(i, neighbour)
                a, b = merged[lo], merged[hi]
                combined_dur = b["end"] - a["start"]
                combined_tempo = float(np.median([a["tempo"], b["tempo"]]))
                combined_num = a["num"] if a["duration"] >= b["duration"] else b["num"]
                merged[lo] = {
                    "start": a["start"],
                    "end": b["end"],
                    "duration": combined_dur,
                    "tempo": combined_tempo,
                    "num": combined_num,
                }
                merged.pop(hi)
                changed = True
                break
            i += 1

    # Assign denominators and compute per-section beat/measure durations
    sections = []
    for idx, sec in enumerate(merged):
        num = sec["num"]
        tempo = sec["tempo"]
        den = _assign_denominator(num, tempo, sec["end"] - sec["start"])
        beat_duration = 60.0 / tempo if tempo > 0 else 0.5
        measure_duration = beat_duration * num

        # First downbeat: earliest beat time >= section start that is bar_position 1
        first_downbeat = sec["start"]
        for i, t in enumerate(beat_times):
            if t >= sec["start"] and bar_positions[i] == 1:
                first_downbeat = t
                break

        # Confidence: inverse of tempo variance within the section
        section_bar_tempos = [
            b["tempo"] for b in bars
            if b["start_time"] >= sec["start"] and b["end_time"] <= sec["end"]
        ]
        if len(section_bar_tempos) >= 2:
            cv = float(np.std(section_bar_tempos)) / (float(np.mean(section_bar_tempos)) + 1e-9)
            confidence = round(max(0.3, 1.0 - min(1.0, cv * 5)), 3)
        else:
            confidence = 0.7

        sections.append({
            "index": idx,
            "start": round(sec["start"], 4),
            "end": round(sec["end"], 4),
            "tempo": round(tempo, 2),
            "time_sig": {"num": num, "den": den},
            "beat_duration": round(beat_duration, 5),
            "measure_duration": round(measure_duration, 5),
            "first_downbeat": round(first_downbeat, 4),
            "confidence": confidence,
        })

    return sections


def _assign_denominator(num: int, tempo: float, measure_dur: float) -> int:
    """Determine the denominator (note value of one beat) from numerator + tempo."""
    if num == 6:
        return 8 if measure_dur < 3.0 and tempo > 90 else 4
    if num == 2:
        return 2 if tempo > 140 else 4
    if num == 3:
        return 4
    if num == 4:
        # Fast 4/4 can be heard as 2/2 (cut time) — collapse if > 180 BPM
        return 2 if tempo > 180 else 4
    if num == 7:
        return 8
    # Fallback for other numerators (5, 8, 9, 12, …)
    return 4
