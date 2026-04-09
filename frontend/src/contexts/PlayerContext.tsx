/**
 * PlayerContext — single source of truth for all audio playback.
 *
 * Lives at the app root (above the router) so navigating between pages never
 * destroys or re-creates the WaveSurfer instances. Both PlayerPage and
 * MiniPlayer consume this context; they are just two views of the same engine.
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useMultiStemPlayer, StemState } from '../hooks/useMultiStemPlayer'
import { api, Song } from '../api/client'

const STEM_ORDER = ['vocals', 'drums', 'bass', 'guitar', 'other']

function sortStems(stems: string[]): string[] {
  return [...stems].sort((a, b) => {
    const ai = STEM_ORDER.indexOf(a)
    const bi = STEM_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

interface PlayerContextValue {
  // Current song metadata
  song: Song | null
  stems: string[]
  // Engine state (from useMultiStemPlayer)
  stemStates: Map<string, StemState>
  isReady: boolean
  isPlaying: boolean
  currentTime: number
  duration: number
  masterVolume: number
  // Actions
  loadSong: (song: Song) => void
  togglePlay: () => void
  seek: (t: number) => void
  seekRelative: (delta: number) => void
  setMasterVolume: (v: number) => void
  setVolume: (name: string, v: number) => void
  toggleMute: (name: string) => void
  toggleSolo: (name: string) => void
  resetMixer: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [song, setSong] = useState<Song | null>(null)
  const [stems, setStems] = useState<string[]>([])

  const engine = useMultiStemPlayer(song?.id ?? '', stems)

  const loadSong = useCallback(async (newSong: Song) => {
    // If this song is already loaded, don't reload
    if (newSong.id === song?.id) return

    // Fetch full song detail to get stems list if needed
    let fullSong = newSong
    if (newSong.stems.length === 0 && newSong.status === 'ready') {
      try { fullSong = await api.getSong(newSong.id) } catch {}
    }

    setSong(fullSong)
    setStems(fullSong.status === 'ready' ? sortStems(fullSong.stems) : [])
  }, [song?.id])

  const resetMixer = useCallback(() => {
    stems.forEach(name => engine.setVolume(name, 1))
    engine.setMasterVolume(1)
  }, [stems, engine.setVolume, engine.setMasterVolume]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PlayerContext.Provider value={{
      song,
      stems,
      ...engine,
      loadSong,
      resetMixer,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
