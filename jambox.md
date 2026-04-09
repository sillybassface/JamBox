# Jambox - Implementation Plan

## Context

Build a greenfield web app for musicians to practice playing along with songs. Users submit YouTube URLs, the system downloads audio and separates it into stems (vocals, drums, bass, guitar, other), then provides a multi-stem player with per-stem volume/mute/solo controls and waveform visualization. Google SSO is optional; guests can browse and play from the shared library. Authenticated users can favourite songs.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **FastAPI** (Python) | Demucs requires Python; FastAPI has native async, WebSocket support |
| Task processing | **asyncio background worker** | No external broker needed (no Redis/Celery); fits local-first model |
| Database | **SQLite** via aiosqlite | Local-first, zero config, async-compatible |
| Stem separation | **Demucs htdemucs** | Best quality hybrid transformer model |
| YouTube download | **yt-dlp** | Standard tool, run as subprocess |
| Frontend | **React + TypeScript + Vite** | Rich audio ecosystem, fast dev experience |
| Audio playback | **wavesurfer.js v7** + Web Audio API | Multi-instance sync, waveform rendering, gain control |
| State management | **Zustand** | Minimal boilerplate for player + auth state |
| Styling | **Tailwind CSS** | Fast custom UI for audio controls |
| Auth | **authlib** (Google OIDC) | Lightweight, handles full OAuth flow |
| Audio format | **MP3** (served to browser) | Compressed for efficient streaming; WAV kept server-side for quality |

## Prerequisites

- Python 3.11+, Node.js 20+, ffmpeg installed

## Project Structure

```
jambox/
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan (worker startup)
│   │   ├── config.py            # pydantic-settings (env vars)
│   │   ├── database.py          # aiosqlite connection, schema init
│   │   ├── models.py            # Pydantic request/response schemas
│   │   ├── auth/
│   │   │   ├── router.py        # /auth/login, /callback, /logout, /me
│   │   │   ├── dependencies.py  # get_current_user, get_optional_user
│   │   │   └── google.py        # Google OIDC client
│   │   ├── songs/
│   │   │   ├── router.py        # /songs CRUD
│   │   │   ├── repository.py    # SQL queries
│   │   │   └── service.py       # Business logic
│   │   ├── favourites/
│   │   │   ├── router.py        # /favourites endpoints
│   │   │   └── repository.py
│   │   ├── tasks/
│   │   │   ├── router.py        # /tasks/{id} status + WebSocket
│   │   │   ├── worker.py        # asyncio queue consumer
│   │   │   └── pipeline.py      # yt-dlp + demucs + mp3 conversion + waveform gen
│   │   └── audio/
│   │       └── router.py        # Serve audio files + waveform JSON
│   └── data/                    # Runtime (gitignored)
│       ├── jambox.db
│       └── songs/{song_id}/
│           ├── original.wav
│           ├── stems/           # vocals.mp3, drums.mp3, bass.mp3, guitar.mp3, other.mp3
│           └── waveforms/       # vocals.json, drums.json, etc.
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx              # Router
│       ├── api/client.ts        # Fetch wrapper
│       ├── stores/
│       │   ├── authStore.ts
│       │   └── playerStore.ts
│       ├── hooks/
│       │   ├── useMultiStemPlayer.ts   # Core: synced wavesurfer instances
│       │   └── useTaskPolling.ts
│       ├── pages/
│       │   ├── LibraryPage.tsx
│       │   ├── FavouritesPage.tsx
│       │   ├── PlayerPage.tsx
│       │   └── AddSongPage.tsx
│       └── components/
│           ├── layout/Header.tsx, MiniPlayer.tsx
│           ├── player/TransportControls.tsx, StemControl.tsx, StemMixer.tsx, WaveformDisplay.tsx
│           └── common/FavouriteButton.tsx, TaskProgress.tsx
└── Makefile
```

## Data Model (SQLite)

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,       -- Google sub
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE songs (
    id            TEXT PRIMARY KEY,       -- UUID
    youtube_url   TEXT NOT NULL,
    youtube_id    TEXT NOT NULL UNIQUE,   -- Dedup key
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_secs REAL,
    thumbnail_url TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending|downloading|separating|ready|error
    error_message TEXT,
    added_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE favourites (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id    TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, song_id)
);

CREATE TABLE tasks (
    id           TEXT PRIMARY KEY,
    song_id      TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'queued',  -- queued|running|completed|failed
    step         TEXT,
    progress     REAL,
    error        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## API Endpoints

### Songs
- `GET /api/songs` — List songs (status=ready). Includes `is_favourite` if authed.
- `GET /api/songs/{id}` — Song detail + stem list
- `POST /api/songs` — Submit YouTube URL → returns 202 with song + task_id
- `DELETE /api/songs/{id}` — Delete song + artifacts

### Tasks
- `GET /api/tasks/{id}` — Poll task status
- `WS /api/tasks/{id}/ws` — Real-time progress

### Audio
- `GET /api/audio/{song_id}/{stem}` — Stream MP3 (supports Range)
- `GET /api/audio/{song_id}/{stem}/waveform` — Precomputed peaks JSON

### Auth
- `GET /api/auth/login` — Redirect to Google
- `GET /api/auth/callback` — Handle callback, set JWT cookie
- `POST /api/auth/logout` — Clear cookie
- `GET /api/auth/me` — Current user or null

### Favourites
- `GET /api/favourites` — User's favourite songs
- `PUT /api/favourites/{song_id}` — Star
- `DELETE /api/favourites/{song_id}` — Unstar

## Processing Pipeline

```
POST /api/songs → validate URL → extract youtube_id → check dupe → insert song(pending) + task(queued) → enqueue → 202

Background worker (sequential, one at a time):
1. DOWNLOAD: yt-dlp subprocess → original.wav
2. SEPARATE: demucs htdemucs subprocess → 5 stem WAVs
3. CONVERT: ffmpeg subprocess → WAV stems to MP3
4. WAVEFORM: generate peak JSON per stem (audiowaveform or Python script)
5. UPDATE: song.status = ready

On error: song.status = error, task.status = failed
Progress published via in-memory pubsub → WebSocket clients
Worker re-enqueues incomplete tasks on startup for crash recovery.
```

## Audio Playback Architecture

One wavesurfer.js instance per stem, all sharing a single `AudioContext`:
- Preloaded waveform peaks from server for instant rendering
- Synchronized play/pause/seek across all instances
- Per-stem GainNode for volume control
- Solo logic: if any stem is soloed, mute all non-soloed stems
- Master instance (vocals) drives shared timeline/playhead

## Auth Flow

Google OIDC via authlib → JWT session in HTTP-only SameSite=Lax cookie (7-day expiry). `get_optional_user` dependency returns None for guests. Frontend calls `/api/auth/me` on init.

## Implementation Phases

### Phase 1: Walking Skeleton (core loop)
1. Backend scaffold: FastAPI app, config, SQLite schema init, health endpoint
2. `POST /api/songs`: validate URL, insert song row, create task, enqueue
3. Processing pipeline: yt-dlp → demucs → ffmpeg MP3 conversion → waveform generation
4. Background worker with asyncio queue
5. `GET /api/songs`, `GET /api/songs/{id}`, `GET /api/audio/...` endpoints
6. Frontend scaffold: Vite + React + TS + Tailwind + React Router
7. AddSongPage: URL input form + task polling status
8. LibraryPage: song grid with status badges
9. PlayerPage: multi-stem waveforms + transport + stem mixer

### Phase 2: Real-time & Polish
1. WebSocket progress updates during processing
2. TaskProgress UI component
3. MiniPlayer persistent bottom bar
4. Error handling and retry for failed tasks
5. Keyboard shortcuts (space=play/pause, arrows=seek)

### Phase 3: Auth & Favourites
1. Google OIDC endpoints (login/callback/logout/me)
2. Frontend auth flow: login button, authStore, protected routes
3. Favourites API endpoints
4. FavouriteButton component + FavouritesPage

### Phase 4: Hardening
1. Duplicate song detection (youtube_id unique)
2. Disk cleanup on song deletion
3. Input validation, rate limiting
4. Responsive/mobile layout

## Verification

1. **Backend**: `uvicorn app.main:app --reload` — hit `/docs` for Swagger UI
2. **Pipeline**: Submit a YouTube URL via Swagger, verify stems appear in `data/songs/`
3. **Frontend**: `npm run dev` — add a song, watch it process, play it in the player
4. **Auth**: Set up Google OAuth credentials, test login/logout flow
5. **Favourites**: Star a song while logged in, verify it appears in /favourites
