# AGENTS.md

## Dev Commands

```bash
# Install dependencies (both backends)
make install

# Run both servers in parallel (recommended)
make dev

# Run backend only
make backend

# Run frontend only
make frontend
```

Backend: `http://localhost:8000`, Swagger at `/docs`  
Frontend: `http://localhost:5173`, proxies `/api` to backend

## Prerequisites

- Python 3.12+ (not 3.14 — the linuxbrew Python 3.14 on PATH breaks Demucs)
- Node.js 20+
- `ffmpeg`, `yt-dlp`, `demucs`, `torchaudio`, `soundfile` installed system-wide
- Backend config via `backend/.env` (gitignored, not `/.env`)

## Monorepo Structure

- `backend/` — FastAPI app, Python package `app/`, run from within this dir
- `frontend/` — Vite + React + TypeScript, `npm` only (no separate build step)
- `backend/demucs_wrapper.py` — Lives at repo root, not in `app/` (invoked as subprocess)

## Important Quirks

- **Python interpreter**: The pipeline uses `/usr/bin/python3` explicitly to avoid linuxbrew Python 3.14. Never change this to just `python3` in the shell.
- **`demucs_wrapper.py`**: Monkey-patches `torchaudio.save` to use `soundfile` instead of `torchcodec`. Do not remove or simplify this shim.
- **Demucs `--mp3` flag**: The pipeline uses `--mp3` so Demucs outputs MP3s directly — the separate ffmpeg conversion step is eliminated.
- **Shared AudioContext**: `useMultiStemPlayer.ts` creates one `AudioContext` shared across all wavesurfer instances via `WebAudioPlayer`. The standard `media:` option passes a `WebAudioPlayer` instance, not a raw element.
- **Two readiness signals**: WaveSurfer's `ready` fires when peaks render; `WebAudioPlayer.canplay` fires when audio decodes. Playback only starts when both are ready.
- **Worker crash recovery**: `start_worker()` re-enqueues incomplete tasks on startup. Always restart the backend to recover stuck tasks.
- **SQLite WAL mode**: Enabled in `get_db()`. Multiple connections can read while one writes.
- **CORS origins**: Configured for `settings.frontend_url` + `localhost:5173` + `localhost:4173`.

## No Test Suite

No `pytest` or Vitest tests exist. The `[dev]` extra in `pyproject.toml` includes pytest but it is not wired to any test discovery. Run verification manually via Swagger UI or browser.

## Adding a Song

1. Submit YouTube URL via `POST /api/songs`
2. Response is `202` with `{song, task_id}` — song is `pending`
3. Poll `GET /api/tasks/{task_id}` or WebSocket `/api/tasks/{task_id}/ws`
4. Song status progresses: `pending` → `downloading` → `separating` → `ready`
5. On error: `status=error`, check `error_message`

## Deleting a Song

`DELETE /api/songs/{song_id}` requires `admin` role (email in `ADMIN_EMAILS`). The route also deletes all files under `data/songs/{song_id}/`.

## Auth

- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env` to enable Google SSO
- Leave empty for guest-only mode (browse and play still works)
- JWT stored in HTTP-only `SameSite=Lax` cookie, 7-day expiry
- `get_optional_user` returns `None` for unauthenticated requests
