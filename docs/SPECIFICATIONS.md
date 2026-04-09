# Software Requirements Specification — Jambox

## 1. Introduction

### 1.1 Purpose
Jambox is a web application that enables musicians to practice playing instruments alongside songs. Users submit a YouTube URL; the system downloads the audio, separates it into instrument stems (vocals, drums, bass, guitar, other), and provides a multi-stem player with per-stem volume/mute/solo controls and waveform visualization.

### 1.2 Scope
This document records the current functional specifications and interface contracts of the Jambox system, reflecting the implementation as it exists. Future enhancements are out of scope.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| Stem | An isolated audio track (e.g., vocals, drums) from the original song |
| Task | A backend job representing one song's processing pipeline |
| Waveform | Precomputed peak data used for waveform visualization |
| Auth user | A user who has logged in via Google OAuth |
| Guest | An unauthenticated visitor |

---

## 2. System Features

### 2.1 Song Library
- **Browse songs**: Any visitor (authenticated or not) can view all songs in the library
- **Song metadata**: Display title, artist, thumbnail, and processing status
- **Status badge**: Show current processing state (`pending`, `downloading`, `separating`, `ready`, `error`)
- **Delete song**: Admin users can delete a song and all its files
- **No user-specific library**: Songs are shared across all users; there is no per-user song collection

### 2.2 Add Song
- **Submit YouTube URL**: Any visitor can submit a YouTube URL
- **Automatic processing**: On submission, the system validates the URL, creates a processing task, and begins pipeline execution
- **Duplicate handling**: If the YouTube ID already exists, return the existing song with its latest task
- **Progress tracking**: Client polls task status or connects via WebSocket for real-time progress
- **Error reporting**: If processing fails, the error message is displayed

### 2.3 Stem Separation Pipeline
The processing pipeline runs sequentially in a background worker:

1. **Download**: Fetch audio from YouTube as WAV using `yt-dlp`
2. **Separate**: Run Demucs `htdemucs` to split into 5 stems (vocals, drums, bass, guitar, other) as MP3s
3. **Waveform**: Precompute RMS amplitude peaks for each stem MP3

Pipeline state is persisted in the database. On worker startup, any incomplete tasks are re-enqueued automatically.

### 2.4 Multi-Stem Player
- **Waveform display**: Each stem renders its precomputed waveform peaks
- **Synchronized playback**: All stems play, pause, and seek in sync
- **Master timeline**: The vocals stem drives the shared timeline and playhead position
- **Per-stem volume**: Each stem has an independent volume slider (0–100%)
- **Per-stem mute**: Each stem can be muted independently
- **Per-stem solo**: Any stem can be soloed; when one or more stems are soloed, all non-soloed stems are muted
- **Master volume**: A global volume control multiplies all stem volumes
- **Seek**: Clicking or dragging on any waveform seeks all stems to that position
- **Keyboard**: Space bar toggles play/pause (future consideration; currently not implemented)

### 2.5 Authentication
- **Google SSO**: Users authenticate via Google OAuth 2.0
- **Guest access**: Unauthenticated users can browse songs, watch processing, and play ready songs
- **JWT session**: After login, a JWT is stored in an HTTP-only cookie (`SameSite=Lax`, 7-day expiry)
- **Disable auth**: If `GOOGLE_CLIENT_ID` is empty, Google login returns 503; the app continues to function in guest mode

### 2.6 Favourites
- **Authenticated only**: Only logged-in users can favourite songs
- **Star/unstar**: Toggle favourite status on any song
- **Favourites page**: Dedicated view showing the user's starred songs

---

## 3. User Interfaces

### 3.1 Pages

| Route | Description |
|-------|-------------|
| `/` and `/library` | Song library grid |
| `/player/:songId` | Multi-stem player for a specific song |
| `/add` | Form to submit a YouTube URL |
| `/favourites` | User's favourite songs (auth required) |

### 3.2 Navigation
- Persistent header with app name, navigation links (Library, Add Song), and auth controls (Login/Logout or user avatar)
- Mini player bar persists across navigation (audio engine is not unmounted on route change)

### 3.3 Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Header` | layout | Top navigation bar |
| `Sidebar` | layout | Navigation sidebar |
| `Layout` | layout | Page wrapper with header/sidebar |
| `MiniPlayer` | layout | Persistent mini player bar |
| `LibraryPage` | page | Song grid |
| `PlayerPage` | page | Full multi-stem player |
| `AddSongPage` | page | URL submission form |
| `FavouritesPage` | page | User's favourite songs |
| `StemMixer` | player | Per-stem volume/mute/solo controls |
| `StemRow` | player | Single stem waveform + controls |
| `TransportControls` | player | Play/pause/seek/master volume |
| `WaveformDisplay` | player | Waveform rendering per stem |
| `TaskProgress` | common | Progress bar during processing |
| `StatusBadge` | common | Processing status indicator |
| `FavouriteButton` | common | Star/unstar toggle |
| `NotificationBell` | layout | Notification indicator |

---

## 4. API Interface

### 4.1 Songs

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/api/songs` | optional | — | `SongOut[]` |
| `GET` | `/api/songs/{song_id}` | optional | — | `SongOut` |
| `POST` | `/api/songs` | optional | `SongCreate` | `AddSongResponse` (202) |
| `DELETE` | `/api/songs/{song_id}` | **admin** | — | 204 |

`SongCreate`: `{"youtube_url": string}`
`AddSongResponse`: `{"song": SongOut, "task_id": string}`

### 4.2 Tasks

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/api/tasks/{task_id}` | — | `TaskOut` |
| `WS` | `/api/tasks/{task_id}/ws` | — | Stream of `TaskOut`-like JSON objects |

### 4.3 Audio

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/audio/{song_id}/{stem}` | — | Stream MP3 (supports `Range`) |
| `GET` | `/api/audio/{song_id}/{stem}/waveform` | — | `WaveformData` JSON |

Valid stem names: `vocals`, `drums`, `bass`, `guitar`, `other`

### 4.4 Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/auth/login` | — | Redirect to Google |
| `GET` | `/api/auth/callback` | — | OAuth callback → JWT cookie |
| `POST` | `/api/auth/logout` | — | Clear JWT cookie |
| `GET` | `/api/auth/me` | — | `UserOut` or `null` |

### 4.5 Favourites

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/favourites` | required | `SongOut[]` |
| `PUT` | `/api/favourites/{song_id}` | required | 204 |
| `DELETE` | `/api/favourites/{song_id}` | required | 204 |

---

## 5. Data Models

### 5.1 SongOut

```typescript
{
  id: string
  youtube_url: string
  youtube_id: string
  title: string
  artist?: string
  duration_secs?: number
  thumbnail_url?: string
  status: 'pending' | 'downloading' | 'separating' | 'ready' | 'error'
  error_message?: string
  added_by?: string
  created_at: string
  updated_at: string
  is_favourite: boolean
  stems: string[]
}
```

### 5.2 TaskOut

```typescript
{
  id: string
  song_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  step?: string
  progress: number  // 0.0–1.0
  error?: string
  created_at: string
}
```

### 5.3 WaveformData

```typescript
{
  peaks: number[]       // RMS amplitude per window, values clamped to [0, 1]
  duration: number      // seconds
  sample_rate: 22050
  samples_per_pixel: 512
}
```

### 5.4 UserOut

```typescript
{
  id: string
  email: string
  display_name: string
  avatar_url?: string
  is_admin: boolean
}
```

---

## 6. Non-Functional Requirements

| Requirement | Value |
|-------------|-------|
| Database | SQLite with WAL mode; supports concurrent reads |
| Auth session | JWT, HTTP-only cookie, 7-day expiry |
| Audio format served to browser | MP3, streamed with `Range` support |
| Processing model | Single asyncio worker, one task at a time |
| Crash recovery | Incomplete tasks re-enqueued on worker startup |
| CORS | Allowed origins: configured `frontend_url`, `localhost:8080`, `localhost:4173` |
| No test suite | Manual verification via Swagger UI or browser |

---

## 7. Configuration

All settings are environment variables loaded from `backend/.env` via `pydantic-settings`.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `"Jambox"` | Application name |
| `SECRET_KEY` | *(insecure default)* | JWT signing key |
| `FRONTEND_URL` | `http://localhost:8080` | CORS and OAuth redirect |
| `DATA_DIR` | `backend/data/` | DB and song files directory |
| `GOOGLE_CLIENT_ID` | `""` | Leave empty to disable Google SSO |
| `GOOGLE_CLIENT_SECRET` | `""` | |
| `JWT_EXPIRE_DAYS` | `7` | Session cookie lifetime |
| `ADMIN_EMAILS` | `["consoilangthang@gmail.com"]` | Admin email list for delete access |
