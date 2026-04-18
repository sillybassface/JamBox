# Technical Notes: Beat, Downbeat & Time-Signature Detection

## Architecture

Detection is a single path with no fallback tiers.  If madmom fails, `save_chords` catches the exception and returns `False` — the frontend shows "unavailable" with a Re-analyze option.

```
detect_beats_and_sections(audio_path)         ← beat_tracking.py
  1. RNNDownBeatProcessor()(audio_path)        → activation function
  2. DBNDownBeatTrackingProcessor(
         beats_per_bar=[2, 3, 4, 6, 7],
         fps=100
     )(act)                                   → [(time, bar_position)]
  3. Snap each beat to nearest onset peak ±40 ms
     (_snap_beats_to_onsets from chord_detection)
  4. Segment beats into sections
  5. Assign denominator per section
  6. Return {beat_times, downbeat_times, sections[]}
```

## Engine: madmom

`madmom.features.downbeats.RNNDownBeatProcessor` + `DBNDownBeatTrackingProcessor` jointly infer beat times and bar positions.  `beats_per_bar=[2, 3, 4, 6, 7]` tells the DBN which numerators to consider — the model picks the most probable one per position.

**Install**: `just install` handles this automatically.  If installing manually:
```bash
sudo apt install python3.12-dev   # Debian/Ubuntu — provides Python.h for C extensions
CC=gcc-13 pip install -e ".[ml]"  # CC= needed on Ubuntu 24+ where gcc-12 isn't present
```
`python3.12-dev` provides the `Python.h` header required to compile madmom's C extensions.  `CC=gcc-13` is needed on Debian/Ubuntu 24+ (e.g. WSL2) where madmom's build looks for `gcc-12` by name.  On macOS or distros that ship `gcc-12` natively, omit the `CC=` override.

## Denominator Heuristic

madmom outputs only a numerator.  Denominators are assigned per-section:

| Numerator | Rule | Result |
|-----------|------|--------|
| 6 | measure_dur < 3.0 s **and** tempo > 90 BPM | 6/8 |
| 6 | otherwise | 6/4 |
| 2 | tempo > 140 BPM | 2/2 (cut time) |
| 2 | otherwise | 2/4 |
| 3 | always | 3/4 |
| 4 | tempo > 180 BPM | 2/2 at half tempo (collapse) |
| 4 | otherwise | 4/4 |
| 7 | always | 7/8 |
| other | always | /4 |

## Section Segmentation

After bar-position grouping, change-points are detected with hysteresis:

- **Numerator change**: new section starts immediately.
- **Tempo change**: `|Δ| > 8 BPM` sustained for ≥ 4 consecutive bars triggers a new section (retroactively placed 3 bars earlier to capture the actual change point).

Sections shorter than **12 s** are merged into their longer adjacent neighbour.

## Schema v2

```jsonc
{
  "schema_version": 2,
  "key": "C",
  "duration": 215.4,
  "global_tempo": 120.0,
  "tempo_stability": "stable",          // "stable" | "moderate" | "variable"
  "tempo_profile": [{"time": 0.0, "bpm": 120.0}, ...],

  "sections": [
    {
      "index": 0,
      "start": 0.0,
      "end": 92.3,
      "tempo": 120.0,
      "time_sig": {"num": 4, "den": 4},
      "beat_duration": 0.5,
      "measure_duration": 2.0,
      "first_downbeat": 0.42,
      "confidence": 0.91
    }
  ],

  "beat_times": [0.42, 0.92, ...],
  "downbeat_times": [0.42, 2.42, ...],

  "measures": [
    {
      "index": 0, "start": 0.42, "end": 2.42,
      "section_index": 0,
      "chords": [{"chord": "C", "beat": 1}]
    }
  ]
}
```

**`legacy: true`** is set when reading a pre-`beat_times` v1 file; the frontend can surface a "Re-analyze" hint.

## v1 Auto-Migration

`GET /{song_id}/chords` migrates v1 files on every read without touching disk:

- Single section spanning the entire song.
- `time_sig` taken from the v1 `time_signature` integer, denominator assumed 4.
- All existing measures get `section_index: 0`.

## Manual Time-Signature Override

```
PATCH /api/audio/{song_id}/chords/section/{idx}/time-sig
Body: {"num": 3, "den": 4}
```

Valid `num`: 2, 3, 4, 5, 6, 7, 8, 9, 12.  Valid `den`: 2, 4, 8.

The backend calls `rebuild_measures_for_section_timesig` which:
1. Updates `sections[idx].time_sig`, `beat_duration`, `measure_duration`.
2. Rebuilds the downbeat grid for that section from `first_downbeat` with new `measure_duration`.
3. Rebuilds measures for that section by re-assigning chords from the existing measure data.
4. Leaves all other sections untouched.

## Removed Features

- **Three-tier detection** (BeatNet → autocorrelation → heuristic) — replaced by single madmom path.
- **TAP button** (`PATCH /chords/downbeat-offset`) — removed entirely.  Use the section time-sig override instead.
