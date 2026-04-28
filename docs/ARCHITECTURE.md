# Jambox Architecture

## System Overview

Jambox is a web app for musicians to practice with songs. Users submit YouTube URLs; the system downloads audio, separates it into stems, detects chords and beats, and optionally transcribes lyrics. The frontend provides a multi-stem player with per-stem controls, waveform visualization, chord chart, and synchronized lyrics.

The app runs as five Docker services:

```
Browser
  ↕ HTTP / WebSocket
frontend  (nginx :8080)
  ↕ proxy /api/*
backend   (FastAPI :8000)
  ↕ LPUSH / SUBSCRIBE
redis     (:6379)   ← task queues + progress pub/sub
  ↕ BRPOP / PUBLISH
worker-analysis          worker-transcription
  ↕                           ↕
  └────── audio_data volume ──┘
                ↕
           SQLite (jambox.db)
```

**Key design decisions:**

- **Redis** replaces in-process `asyncio.Queue` and in-memory pub/sub. Workers are separate containers that block on `BRPOP`; the backend only enqueues and subscribes.
- **SQLite + shared Docker volume** instead of PostgreSQL. WAL mode + `busy_timeout=5000ms` handles concurrent reads/writes from three processes. Avoids migration complexity while remaining sufficient for this app's single-writer-per-job pattern.
- **One codebase, multiple images.** Workers are thin entrypoints in `workers/` that import from the backend Python package (`backend/app/`). `pyproject.toml` optional dependency groups (`[analysis]`, `[transcription]`) give each image only the ML deps it needs.
- **No frontend changes.** The WebSocket message format at `/api/tasks/{task_id}/ws` is preserved; only the backend's internal plumbing changed.

---

## Services

### `frontend` — nginx

- Serves the built React SPA from `/usr/share/nginx/html`
- Proxies `/api/tasks/*` with WebSocket upgrade headers and `proxy_read_timeout 3600s`
- Proxies all other `/api/*` to `http://backend:8000`
- SPA fallback: any unmatched path returns `index.html`
- Config: `frontend/nginx.conf`

### `backend` — FastAPI

Handles all HTTP/WebSocket traffic. **No ML or audio-processing dependencies** — only the core web stack plus `redis` and `yt-dlp` (needed for YouTube metadata at song-creation time).

**Domain modules (`backend/app/`):**

| Module | Responsibility |
|--------|----------------|
| `main.py` | App factory, CORS, router inclusion, lifespan (db init, Redis close) |
| `config.py` | `pydantic-settings` from `.env`; paths, JWT/OAuth config, `redis_url` |
| `database.py` | `aiosqlite` connection, WAL + busy_timeout, schema init + migrations |
| `redis_client.py` | Shared async Redis connection singleton |
| `models.py` | Pydantic request/response schemas |
| `songs/` | Song CRUD, YouTube metadata fetch, lyrics endpoints |
| `tasks/` | Task status API, WebSocket, Redis enqueue helpers, pubsub adapter |
| `audio/` | Serve MP3 stems, waveform JSON, chord JSON; on-demand chord trigger |
| `auth/` | Google OIDC login/callback/logout/me, JWT in HTTP-only cookie |
| `favourites/` | Per-user favourite songs |

**Task flow (backend side):**
1. `POST /api/songs` → create song + task in DB → `LPUSH queue:analysis` → return `{song, task_id}`
2. `POST /api/songs/{id}/lyrics` → create task → `LPUSH queue:transcription` → return `{task_id}`
3. `POST /api/audio/{id}/chords` → create task → `LPUSH queue:analysis` (chords-only type)

**WebSocket (`tasks/router.py`):**
- On connect: send current task status from DB immediately (handles late connections)
- If task already terminal: return immediately without subscribing
- Subscribe to Redis channel `progress:{task_id}` via `pubsub.subscribe()`
- Stream `ps.listen()` messages to the WebSocket client until `completed` or `failed`

### `worker-analysis`

Heavy image (~4 GB): Python 3.12 + ffmpeg + git + demucs + librosa + madmom + yt-dlp.

Runs `workers/analysis/main.py` which loops on `BRPOP queue:analysis`. Handles two task types:

- **`full_analysis`** — calls `run_pipeline(song_id, youtube_url, progress)`:
  1. **download** — `yt-dlp -x --audio-format wav` → `original.wav`
  2. **separate** — `demucs --mp3` via `demucs_wrapper.py` → `stems/*.mp3`; streams stderr to parse tqdm `%` and publish real-time progress
  3. **waveform** — ffmpeg → PCM float32 → RMS peaks → `waveforms/*.json`
  4. **chords** — librosa chroma + madmom beat tracking → `chords.json` (non-fatal; pipeline succeeds even if this fails)

- **`chords_only`** — runs chord detection on an already-separated song

`demucs_wrapper.py` monkey-patches `torchaudio.save` to use `soundfile` instead of `torchcodec`. It's located at the package root and invoked as a subprocess using `sys.executable` (the container's venv Python). Path resolution: `Path(__file__).parent.parent.parent` from `app/tasks/pipeline.py` → package root.

On startup: marks any lingering `queued`/`running` tasks as failed (worker restart recovery).

### `worker-transcription`

Lighter image: Python 3.12 + ffmpeg + openai-whisper.

Runs `workers/transcription/main.py` which loops on `BRPOP queue:transcription`. Handles two task types:

- **`lyrics`** — calls `save_lyrics()` (the async version directly — not `save_lyrics_sync`, which wraps it in `asyncio.run()` and would crash inside an already-running loop):
  1. Run Whisper `medium` model on `stems/vocals.mp3` for word timestamps
  2. Try to fetch external lyrics (YouTube captions → Lyrics.ovh → lrclib)
  3. Fuzzy-align external words to Whisper timestamps if found; otherwise use Whisper only
  4. Write `lyrics.json` + update `songs.lyrics` in DB

- **`custom_lyrics`** — user-supplied text + Whisper timestamps: run Whisper for timing, align custom text against Whisper words

### `redis`

`redis:7-alpine`. Serves two purposes:
- **Task queues** — Redis Lists, `LPUSH`/`BRPOP` pattern (one worker polls one queue, atomic pop prevents double-processing even with multiple worker replicas)
- **Progress pub/sub** — `PUBLISH progress:{task_id}` from workers; `SUBSCRIBE` from backend WebSocket handlers

### Shared volumes

| Volume | Mounted at | Used by |
|--------|-----------|---------|
| `audio_data` | `/data` | backend (stream stems), worker-analysis (write), worker-transcription (read/write) |
| `redis_data` | `/data` (redis container) | Redis persistence |
| `model_cache` | `/model_cache` | worker-analysis (Demucs/torch model cache via `TORCH_HOME`), worker-transcription (Whisper cache via `XDG_CACHE_HOME`) |

The `model_cache` volume persists across restarts so ML models are only downloaded on the first cold start.

---

## Data Storage

| Path (inside `/data`) | Content |
|-----------------------|---------|
| `jambox.db` | SQLite — `users`, `songs`, `tasks`, `favourites` |
| `songs/{id}/original.wav` | Downloaded audio (44.1 kHz stereo) |
| `songs/{id}/stems/*.mp3` | Separated stems at 320 kbps (`vocals`, `drums`, `bass`, `other`, optionally `guitar`) |
| `songs/{id}/waveforms/*.json` | Precomputed RMS peak data (22050 Hz, 512-sample windows) |
| `songs/{id}/chords.json` | Schema v2: key, tempo, sections, beat/downbeat times, per-measure chords |
| `songs/{id}/lyrics.json` | Per-word timestamps with phrase boundaries and source metadata |

**`chords.json` schema v2** (v1 is migrated on read, no disk write):
- `sections[]` — tempo/time-signature segments with beat grid parameters
- `measures[]` — beat-aligned chord assignments with `section_index`
- `beat_times` / `downbeat_times` — snapped to librosa onset peaks (±46 ms window)
- Time signature denominator inferred from numerator and tempo (2/4/8)

---

## Frontend (`frontend/`)

### Stack
- **React 18** + **TypeScript** + **Vite** (dev server port 8080, proxies `/api` to `:8000`)
- **React Router v7** — `/`, `/library`, `/favourites`, `/add`, `/player/:songId`
- **Zustand** — `playerStore`, `authStore`, `notificationStore`, `themeStore`
- **wavesurfer.js v7** — one instance per stem
- **Tailwind CSS** + Material Design 3 color tokens

### Audio engine (`hooks/useMultiStemPlayer.ts`)

- One `WaveSurfer` instance per stem, all sharing a **single `AudioContext`**
- Vocals instance is the **master timeline driver** — its `audioprocess` event drives `currentTime`
- **Two readiness signals**: `waveformReadyRef` (peaks rendered) + `audioReadyRef` (buffer decoded); both must fire before playback
- Solo logic: if any stem is soloed, all others mute

### Task progress (`hooks/useTaskPolling.ts`)

- `useTaskWebSocket(taskId)` — preferred; opens `ws[s]://…/api/tasks/{taskId}/ws`, auto-closes on terminal status
- `useTaskPolling(taskId)` — fallback HTTP polling every 2 s

### Key files

| File | Purpose |
|------|---------|
| `src/hooks/useMultiStemPlayer.ts` | Core audio engine |
| `src/contexts/PlayerContext.tsx` | React context wrapping the player hook |
| `src/api/client.ts` | Typed fetch wrapper + WebSocket helper |
| `src/components/player/ChordChart.tsx` | Chord/beat grid with section-based layout |
| `src/components/player/Lyrics.tsx` | Word-by-word synchronized lyrics |
| `src/components/player/StemMixer.tsx` | Volume/mute/solo per stem |
| `src/components/player/Equalizer.tsx` | 10-band EQ with presets |

---

## Auth

- Google OIDC via `authlib` — manual token exchange
- JWT payload: `{"sub": user_id, "exp": …}` encoded with HS256, stored in HTTP-only cookie (7-day expiry)
- `get_optional_user` returns `None` for guests (browse/play without login)
- `require_admin` checks `settings.admin_emails` (delete song)
- Guests can browse and play; only authenticated users can favourite

---

## Configuration

All services are configured via environment variables (see `.env.example`):

| Variable | Default | Used by |
|----------|---------|---------|
| `SECRET_KEY` | (required) | backend JWT signing |
| `REDIS_URL` | `redis://redis:6379` | backend, workers |
| `DATA_DIR` | `/data` | backend, workers (shared volume mount point) |
| `GOOGLE_CLIENT_ID/SECRET` | (empty = SSO disabled) | backend |
| `TORCH_HOME` | `/model_cache` | worker-analysis |
| `XDG_CACHE_HOME` | `/model_cache` | worker-transcription |
