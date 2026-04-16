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
export type Measure = { index: number; start: number; end: number; chords: ChordEntry[] }
export type ChordData = {
  tempo: number
  time_signature: number
  key: string
  beat_duration: number
  measure_duration: number
  measures: Measure[]
  error?: string
}

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
}
