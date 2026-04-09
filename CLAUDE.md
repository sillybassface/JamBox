# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jambox is a web app for musicians to practice playing along with songs. Users submit YouTube URLs, the system downloads audio and separates it into stems (vocals, drums, bass, guitar, other) via Demucs, then provides a multi-stem player with per-stem volume/mute/solo controls and waveform visualization. See `jambox.md` for the full implementation plan.

## Tech Stack

- **Backend**: FastAPI (Python 3.11+), SQLite via aiosqlite, asyncio background worker
- **Frontend**: React + TypeScript + Vite, Tailwind CSS, Zustand, wavesurfer.js v7
- **External tools**: yt-dlp, ffmpeg, Demucs (htdemucs model)
- **Auth**: Google OIDC via authlib, JWT in HTTP-only cookie

## Prerequisites

Python 3.11+, Node.js 20+, ffmpeg installed

## Build & Run Commands

```bash
# Backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload          # Dev server at :8000, Swagger at /docs

# Frontend
cd frontend
npm install
npm run dev                             # Vite dev server, proxies /api to backend
```

## Architecture

**Backend** (`backend/app/`): FastAPI app organized by domain — `songs/`, `tasks/`, `auth/`, `favourites/`, `audio/`. Each domain has a router, and optionally a repository (SQL queries) and service (business logic).

**Processing pipeline** (`tasks/pipeline.py`): Sequential steps — yt-dlp download → Demucs stem separation → ffmpeg WAV-to-MP3 conversion → waveform peak generation. Runs in an asyncio background worker (`tasks/worker.py`), one job at a time. Progress published via in-memory pubsub to WebSocket clients.

**Frontend** (`frontend/src/`): React Router pages (Library, Player, AddSong, Favourites). The core audio logic lives in `hooks/useMultiStemPlayer.ts` — one wavesurfer.js instance per stem sharing a single AudioContext, with the vocals instance as the master timeline driver.

**Data storage**: SQLite database at `backend/data/jambox.db`. Audio files at `backend/data/songs/{song_id}/` with `original.wav`, `stems/*.mp3`, and `waveforms/*.json`.

**Auth**: Optional Google SSO. Guests can browse and play. Authenticated users can favourite songs. `get_optional_user` dependency returns None for guests.
