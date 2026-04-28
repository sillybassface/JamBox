"""Chord data helpers for the backend API."""
import json
from pathlib import Path

from app.config import settings


def rebuild_measures_for_section_timesig(data: dict, section_idx: int, num: int, den: int) -> dict:
    """Rebuild measures for one section after a manual time-signature override."""
    sections: list[dict] = data.get("sections", [])
    if section_idx >= len(sections):
        return data

    sec = sections[section_idx]
    beat_duration = sec["beat_duration"]
    new_measure_duration = beat_duration * num

    sec["time_sig"] = {"num": num, "den": den}
    sec["measure_duration"] = round(new_measure_duration, 5)

    first_db = sec.get("first_downbeat", sec["start"])
    new_downbeats: list[float] = []
    t = first_db
    while t < sec["end"]:
        new_downbeats.append(round(t, 4))
        t += new_measure_duration

    all_downbeats: list[float] = data.get("downbeat_times", [])
    outside = [d for d in all_downbeats if not (sec["start"] <= d < sec["end"])]
    merged_downbeats = sorted(outside + new_downbeats)
    data["downbeat_times"] = merged_downbeats

    old_measures: list[dict] = data.get("measures", [])
    kept = [m for m in old_measures if m.get("section_index") != section_idx]

    def _chord_at_time(measures, t, sig_num):
        for m in measures:
            if m["start"] <= t < m["end"]:
                chords = m.get("chords", [])
                for c in chords:
                    if c.get("beat", 1) == 1:
                        return c.get("chord", "N")
        return "N"

    new_measures: list[dict] = []
    for i in range(len(new_downbeats) - 1):
        m_start = new_downbeats[i]
        m_end = new_downbeats[i + 1]
        beat_chords = [_chord_at_time(old_measures, m_start + (b + 0.5) * (m_end - m_start) / num, num) for b in range(num)]
        new_measures.append({
            "index": 0,
            "start": round(m_start, 3),
            "end": round(m_end, 3),
            "section_index": section_idx,
            "chords": [{"chord": bc, "beat": 1} for bc in beat_chords if bc != "N"],
        })

    all_measures = sorted(kept + new_measures, key=lambda m: m["start"])
    for i, m in enumerate(all_measures):
        m["index"] = i

    data["measures"] = all_measures
    return data


async def update_chords_file(song_id: str, data: dict):
    """Write updated chord data to file."""
    path = settings.songs_dir / song_id / "chords.json"
    path.write_text(json.dumps(data))