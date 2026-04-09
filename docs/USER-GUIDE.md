# Jambox User Guide

Jambox lets you practice playing instruments alongside your favorite songs. Submit a YouTube link and Jambox separates the audio into individual instrument stems — vocals, drums, bass, guitar, and other — so you can play along with just the parts you need.

---

## Adding a Song

1. Click **Add Song** in the navigation bar
2. Paste a YouTube URL (single videos only, not playlists)
3. Click **Submit**

Jambox will start downloading and separating the audio. This takes a few minutes. You can watch the progress on the Add Song page or navigate away and check back later.

> **Tip:** You can submit a YouTube URL from the Library page too. Look for the "Add Song" link in the header.

---

## Understanding Processing Status

Songs move through these states as they process:

| Status | What it means |
|--------|---------------|
| **Pending** | Queued, waiting for the worker to pick it up |
| **Downloading** | Fetching audio from YouTube |
| **Separating** | Running stem separation (this is the slow step) |
| **Ready** | Done — the song is playable |
| **Error** | Something went wrong. Check the error message below the status badge |

If a song shows an error, try deleting it and submitting the URL again.

---

## Playing a Song

Click any **ready** song in the Library to open the player.

The player shows one waveform per stem. The **vocals stem** controls the playhead — when you click or drag on any waveform, all stems jump to that position.

### Playback Controls

- **Play / Pause** — click the button or press `Space`
- **Seek** — click anywhere on a waveform to jump to that point
- **Master volume** — the slider in the transport bar controls the overall volume

---

## Adjusting Stems

Each stem row has its own controls:

- **Volume slider** — raise or lower that instrument's volume
- **Mute button** — silence that stem entirely
- **Solo button** — hear only that stem (or combine multiple solos)

> **How solo works:** Press **S** on drums to hear just drums. Press **S** on bass too, and you'll hear drums + bass together. Everything else goes silent.

### Default Stem Colors

| Stem | Color |
|------|-------|
| Vocals | Purple |
| Drums | Cyan |
| Bass | Lime |
| Guitar | Amber |
| Other | Pink |

---

## Favouriting Songs

Click the **star** icon on any song card or in the player to add it to your Favourites. Starred songs appear in the **Favourites** page for quick access.

Favouriting requires a Google account. If you're not logged in, Jambox will redirect you to sign in.

---

## Signing In

1. Click **Login** in the header
2. Sign in with your Google account
3. You'll be redirected back to Jambox

Once logged in, your avatar appears in the header. Click it to sign out.

> **No account needed:** You can browse, play, and submit songs without signing in. Logging in only enables the Favourites feature.

---

## Deleting a Song

Only admin users can delete songs. If you believe a song should be removed, contact the site administrator.
