# Jambox Architecture

## System Overview

Jambox is a full-stack web app for musicians to practice with songs. Users submit YouTube URLs, the backend downloads and separates audio into stems (vocals, drums, bass, guitar, other) via Demucs, and the frontend provides a multi-stem player with per-stem controls and waveform visualization.

```
Browser (React/Vite)  ←→  FastAPI (:8000)  ←→  asyncio worker
                         SQLite             →  yt-dlp / Demucs / ffmpeg
```

## Backend (`backend/`)

### Stack
- **FastAPI** with lifespan management — worker starts/stops with the app
- **SQLite** via `aiosqlite` with WAL mode, row factory
- **asyncio background worker** — single-threaded, processes one task at a time from a queue
- **JWT** in HTTP-only cookie (7-day expiry, `itsdangerous` + `python-jose`)
- **Demucs htdemucs** — invoked as subprocess via `backend/demucs_wrapper.py`

### Domain Modules (`backend/app/`)

| Module | Responsibility |
|--------|----------------|
| `main.py` | FastAPI app, CORS, router inclusion, lifespan (db init, worker start/stop) |
| `config.py` | `pydantic-settings` from `.env`, paths, JWT/OAuth config |
| `database.py` | `aiosqlite` connection, WAL mode, schema init |
| `models.py` | Pydantic request/response schemas |
| `songs/` | CRUD, repository pattern |
| `tasks/` | Task status, WebSocket, worker, pubsub, pipeline |
| `audio/` | Serve MP3 stems and waveform JSON |
| `auth/` | Google OIDC login/callback/logout/me, JWT in cookie |
| `favourites/` | Per-user favourite songs |

### Processing Pipeline (`tasks/pipeline.py`)

Sequential, runs in the background worker:

1. **download** — `yt-dlp -x --audio-format wav` → `original.wav`
2. **separate** — `demucs --mp3` (via `demucs_wrapper.py`) → `stems/*.mp3`  
   - `demucs_wrapper.py` monkey-patches `torchaudio.save` to use `soundfile` instead of `torchcodec`
   - Runs with `/usr/bin/python3` explicitly (not linuxbrew Python 3.14 on PATH)
   - Streams stderr to parse tqdm `%` progress, publishes real-time updates
3. **waveform** — ffmpeg → PCM float32 → RMS peaks → `waveforms/*.json`

Progress published via in-memory pubsub (`tasks/pubsub.py`) → WebSocket clients.  
Worker re-enqueues incomplete tasks on startup for crash recovery.

### Auth

- Google OIDC via `authlib` — manual token exchange (no authlib integrated client)
- JWT payload: `{"sub": user_id, "exp": ...}` encoded with `HS256`
- `get_optional_user` returns `None` for guests; `require_admin` checks `settings.admin_emails`

## Frontend (`frontend/`)

### Stack
- **React 18** + **TypeScript** + **Vite** (port 8080, proxies `/api` to backend)
- **React Router v7** — `/`, `/library`, `/favourites`, `/add`, `/player/:songId`
- **Zustand** — `playerStore` (currentSong, isPlaying, currentTime, duration), `authStore`
- **wavesurfer.js v7** — one instance per stem
- **Tailwind CSS** — utility styling

### Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useMultiStemPlayer.ts` | Core audio engine — synced wavesurfer instances sharing one `AudioContext` |
| `src/contexts/PlayerContext.tsx` | React context wrapping Zustand store |
| `src/api/client.ts` | Fetch wrapper with typed API methods |
| `src/components/player/StemMixer.tsx` | Volume/mute/solo per stem |
| `src/components/player/TransportControls.tsx` | Play/pause/seek |

### Audio Architecture

- One `WaveSurfer` instance per stem, all sharing a **single `AudioContext`** (created by passing `WebAudioPlayer` instances via `media:` option)
- Vocals instance is the **master timeline driver** — first to fire `ready` sets duration, drives `audioprocess`
- **Two readiness signals**: `waveformReadyRef` (peaks rendered) and `audioReadyRef` (buffer decoded). Both must fire before playback starts
- `pendingPlayRef` handles auto-play when audio loads after a user gesture
- Solo logic: if any stem is soloed, non-soloed stems mute

## Data Storage

| Path | Content |
|------|---------|
| `backend/data/jambox.db` | SQLite — users, songs, tasks, favourites |
| `backend/data/songs/{song_id}/original.wav` | Downloaded audio |
| `backend/data/songs/{song_id}/stems/*.mp3` | Separated stems |
| `backend/data/songs/{song_id}/waveforms/*.json` | Precomputed peak data |
| `backend/demucs_wrapper.py` | Demucs shim (in repo root, not `app/`) |

All `data/` files are gitignored. The `.env` at repo root configures nothing for Jambox — backend settings come from `backend/.env` (also gitignored).
