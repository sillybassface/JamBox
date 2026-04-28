const BASE = '/api'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  if (res.status === 204) return null as T
  return res.json()
}

export type Song = {
  id: string
  youtube_url: string
  youtube_id: string
  title: string
  artist?: string
  duration_secs?: number
  thumbnail_url?: string
  status: 'pending' | 'downloading' | 'separating' | 'converting' | 'waveform' | 'ready' | 'error'
  error_message?: string
  added_by?: string
  created_at: string
  updated_at: string
  is_favourite: boolean
  stems: string[]
}

export type Task = {
  id: string
  song_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  step?: string
  progress: number
  error?: string
  created_at: string
}

export type User = {
  id: string
  email: string
  display_name: string
  avatar_url?: string
  is_admin?: boolean
}

export type WaveformData = {
  peaks: number[]
  duration: number
  sample_rate: number
  samples_per_pixel: number
}

export type ChordEntry = { chord: string; beat: number }
export type TimeSig = { num: number; den: number }
export type Section = {
  index: number
  start: number
  end: number
  tempo: number
  time_sig: TimeSig
  beat_duration: number
  measure_duration: number
  first_downbeat: number
  confidence: number
}
export type Measure = {
  index: number
  start: number
  end: number
  section_index: number
  chords: ChordEntry[]
}
export type ChordData = {
  schema_version: number
  key: string
  duration: number
  global_tempo: number
  tempo_stability: "stable" | "moderate" | "variable"
  tempo_profile: Array<{ time: number; bpm: number }>
  sections: Section[]
  beat_times: number[]
  downbeat_times: number[]
  measures: Measure[]
  legacy?: boolean
  error?: string
}

export type LyricWord = { word: string; start: number; end: number; is_phrase_start?: boolean }
export type LyricsData = { words: LyricWord[]; source?: 'whisper' | 'hybrid' | 'external' | 'custom'; custom_text?: string }

export const api = {
  // Auth
  me: () => req<User | null>('/auth/me'),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),

  // Songs
  getSongs: () => req<Song[]>('/songs'),
  getSong: (id: string) => req<Song>(`/songs/${id}`),
  addSong: (youtube_url: string) =>
    req<{ song: Song; task_id: string }>('/songs', { method: 'POST', body: JSON.stringify({ youtube_url }) }),
  deleteSong: (id: string) => req<void>(`/songs/${id}`, { method: 'DELETE' }),

  // Tasks
  getTask: (id: string) => req<Task>(`/tasks/${id}`),

  // Favourites
  getFavourites: () => req<Song[]>('/favourites'),
  addFavourite: (songId: string) => req<void>(`/favourites/${songId}`, { method: 'PUT' }),
  removeFavourite: (songId: string) => req<void>(`/favourites/${songId}`, { method: 'DELETE' }),

  // Audio
  stemUrl: (songId: string, stem: string) => `/api/audio/${songId}/${stem}`,
  waveformUrl: (songId: string, stem: string) => `/api/audio/${songId}/${stem}/waveform`,
  getWaveform: (songId: string, stem: string) =>
    req<WaveformData>(`/audio/${songId}/${stem}/waveform`),

  // Chords — returns null when not yet ready (202)
  getChords: async (songId: string): Promise<ChordData | null> => {
    const res = await fetch(`/api/audio/${songId}/chords`, { credentials: 'include' })
    if (res.status === 202) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  generateChords: (songId: string): Promise<{ status: string }> =>
    req<{ status: string }>(`/audio/${songId}/chords`, { method: 'POST' }),
  setSectionTimeSig: async (songId: string, sectionIdx: number, timeSig: { num: number; den: number }): Promise<void> => {
    const res = await fetch(`/api/audio/${songId}/chords/section/${sectionIdx}/time-sig`, {
      credentials: 'include',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeSig),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },

  // Lyrics
  getLyrics: (songId: string) =>
    req<{ lyrics: LyricsData | null; error?: string; task_status?: string; task_step?: string; task_progress?: number }>(
      `/songs/${songId}/lyrics`
    ),
  generateLyrics: (songId: string, language: string = 'kelvin'): Promise<{ task_id?: string; status: string; lyrics?: LyricsData }> =>
    req<{ task_id?: string; status: string; lyrics?: LyricsData }>(`/songs/${songId}/lyrics?language=${language}`, { method: 'POST' }),
  setCustomLyrics: (songId: string, lyricsText: string, regenerate = false) =>
    req<{ task_id?: string; status: string; lyrics?: string }>(`/songs/${songId}/lyrics`, {
      method: 'PUT',
      body: JSON.stringify({ lyrics_text: lyricsText, regenerate }),
    }),
  deleteLyrics: (songId: string) =>
    req<{ status: string }>(`/songs/${songId}/lyrics`, { method: 'DELETE' }),
}
