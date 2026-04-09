import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Song } from '../api/client'
import { usePlayer } from '../contexts/PlayerContext'
import TransportControls from '../components/player/TransportControls'
import StemRow from '../components/player/StemRow'
import FavouriteButton from '../components/common/FavouriteButton'
import StatusBadge from '../components/common/StatusBadge'

export default function PlayerPage() {
  const { songId } = useParams<{ songId: string }>()
  const navigate = useNavigate()
  const [pageSong, setPageSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    song: activeSong, stems, loadSong,
    stemStates, isReady, isPlaying, currentTime, duration, masterVolume,
    togglePlay, seek, seekRelative,
    setMasterVolume, setVolume, toggleMute, toggleSolo, resetMixer,
  } = usePlayer()

  // Fetch song metadata for this page, then hand it to the shared player
  useEffect(() => {
    if (!songId) return
    setLoading(true)
    api.getSong(songId)
      .then(s => {
        setPageSong(s)
        if (s.status === 'ready') loadSong(s)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [songId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seekRelative(-5) }
      if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(5) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlay, seekRelative])

  // The song to display: prefer the page-fetched metadata (freshest); fall back
  // to what's already loaded in the shared player (e.g. navigated here from library)
  const song = pageSong ?? activeSong

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
    </div>
  )

  if (error || !song) return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <span className="material-symbols-outlined text-6xl text-error">error</span>
      <p className="text-on-surface-variant">{error ?? 'Song not found'}</p>
      <button onClick={() => navigate('/')} className="text-secondary hover:underline">← Back to Library</button>
    </div>
  )

  if (song.status !== 'ready') return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <StatusBadge status={song.status} />
      <h2 className="font-headline text-2xl font-bold">{song.title}</h2>
      <p className="text-on-surface-variant">This song is still being processed. Check back soon.</p>
      <button onClick={() => navigate('/')} className="text-secondary hover:underline">← Back to Library</button>
    </div>
  )

  // Is the shared player currently loaded with a different song?
  const wrongSong = activeSong?.id !== song.id

  return (
    <div className="flex flex-col px-6 md:px-10 py-8 gap-6 max-w-6xl mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          {song.thumbnail_url ? (
            <img
              src={song.thumbnail_url}
              alt={song.title}
              className="w-20 h-20 md:w-24 md:h-24 rounded-xl object-cover shadow-2xl border border-white/10"
            />
          ) : (
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-surface-container-highest flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-3xl text-primary">music_note</span>
            </div>
          )}
          <div className="absolute -top-2 -right-2">
            <FavouriteButton
              songId={song.id}
              isFavourite={song.is_favourite}
              className="p-1.5 rounded-full bg-surface-container-high border border-white/10 hover:scale-110 transition-transform"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold tracking-tighter text-on-surface truncate">
            {song.title}
          </h1>
          {song.artist && (
            <p className="text-secondary font-label uppercase tracking-widest text-xs mt-0.5 truncate">{song.artist}</p>
          )}
          <p className="text-on-surface-variant text-xs font-label mt-1 uppercase tracking-[0.15em]">
            {stems.length} Stems
          </p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="hidden md:flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors text-sm font-label flex-shrink-0"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Library
        </button>
      </div>

      {/* ── Player not yet loaded for this song ── */}
      {wrongSong && (
        <div className="bg-surface-container rounded-2xl border border-white/5 p-8 flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
          <p className="text-on-surface-variant text-sm">Loading stems…</p>
        </div>
      )}

      {/* ── Transport + Stems ── */}
      {!wrongSong && (
        <div className="bg-surface-container rounded-2xl border border-white/5 overflow-hidden">

          {/* Transport row */}
          <div className="px-6 py-5 border-b border-white/5">
            <TransportControls
              isPlaying={isPlaying}
              isReady={isReady}
              currentTime={currentTime}
              duration={duration}
              masterVolume={masterVolume}
              onTogglePlay={togglePlay}
              onSeek={seek}
              onSeekRelative={seekRelative}
              onMasterVolumeChange={setMasterVolume}
            />
          </div>

          {/* Mixer header */}
          <div className="flex items-center justify-between px-6 py-3 bg-surface-container-low/60">
            <span className="font-headline font-bold text-xs uppercase tracking-widest text-on-surface-variant">
              Stem Mixer
            </span>
            <button
              onClick={resetMixer}
              className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface border border-outline-variant/30 px-3 py-1 rounded-lg transition-colors"
            >
              Reset All
            </button>
          </div>

          {/* Stem rows */}
          <div className="divide-y divide-white/5">
            {stems.map(name => {
              const stem = stemStates.get(name)
              if (!stem) return null
              return (
                <StemRow
                  key={name}
                  stem={stem}
                  currentTime={currentTime}
                  duration={duration}
                  onVolumeChange={setVolume}
                  onToggleMute={toggleMute}
                  onToggleSolo={toggleSolo}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
