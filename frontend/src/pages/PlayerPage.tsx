import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Song, ChordData } from '../api/client'
import { usePlayer } from '../contexts/PlayerContext'
import TransportControls from '../components/player/TransportControls'
import StemRow from '../components/player/StemRow'
import ChordChart from '../components/player/ChordChart'
import Lyrics from '../components/player/Lyrics'
import Equalizer, { EQ_PRESETS } from '../components/player/Equalizer'
import FavouriteButton from '../components/common/FavouriteButton'
import StatusBadge from '../components/common/StatusBadge'

export default function PlayerPage() {
  const { songId } = useParams<{ songId: string }>()
  const navigate = useNavigate()
  const [pageSong, setPageSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chordData, setChordData] = useState<ChordData | null>(null)

  const [showDegree, setShowDegree] = useState(false)
  const [isInstrumentsOpen, setIsInstrumentsOpen] = useState(true)
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false)
  const [eqPreset, setEqPreset] = useState('Flat')
  const [eqGains, setEqGains] = useState<number[]>(() => [...EQ_PRESETS.Flat])
  const [customEqGains, setCustomEqGains] = useState<number[]>(() => new Array(10).fill(0))
  const [eqKey, setEqKey] = useState(0)
  const [eqInitialGains, setEqInitialGains] = useState<number[] | undefined>(() => [...EQ_PRESETS.Flat])
  const eqGainsRef = useRef(eqGains)
  const customEqGainsRef = useRef(customEqGains)

  // Keep refs in sync
  useEffect(() => {
    eqGainsRef.current = eqGains
  }, [eqGains])
  useEffect(() => {
    customEqGainsRef.current = customEqGains
  }, [customEqGains])

  const {
    song: activeSong, stems, loadSong,
    stemStates, isReady, isPlaying, currentTime, duration, masterVolume,
    togglePlay, seek, seekRelative,
    setMasterVolume, setVolume, setEq, toggleMute, toggleSolo, resetMixer,
  } = usePlayer()

  const handleEqChange = useCallback((gains: number[], isExternal: boolean) => {
    // Skip processing during external preset sync to avoid loop
    if (isExternal) return
    
    setEqGains(gains)
    setEq(gains)
  }, [setEq])

  // Track custom gains - save whenever eqGains changes while in Custom mode
  useEffect(() => {
    if (eqPreset === 'Custom') {
      setCustomEqGains(eqGains)
    }
  }, [eqPreset, eqGains])

  const handleEqUserChange = useCallback(() => {
    setEqPreset('Custom')
    setEqInitialGains(undefined) // let Equalizer manage its own state after user interaction
  }, [])

  const handlePresetChange = useCallback((preset: string) => {
    const currentEqGains = [...eqGainsRef.current]

    // Save current gains when leaving Custom mode
    if (eqPreset === 'Custom') {
      setCustomEqGains(currentEqGains)
      customEqGainsRef.current = currentEqGains
    }

    if (preset === 'Custom') {
      // Restore saved custom gains; remount Equalizer so sliders reflect restored values
      const restored = [...customEqGainsRef.current]
      setEqGains(restored)
      setEq(restored)
      setEqInitialGains(restored)
      setEqKey(k => k + 1)
    } else {
      const gains = EQ_PRESETS[preset] || EQ_PRESETS.Flat
      setEqGains(gains)
      setEq(gains)
      setEqInitialGains(gains)
      setEqKey(k => k + 1)
    }
    setEqPreset(preset)
  }, [eqPreset, setEq])

  // Fetch song metadata for this page, then hand it to the shared player
  useEffect(() => {
    if (!songId) return
    setChordData(null)
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
  const toggleStemMute = useCallback((key: string) => {
    const stemName = key.toLowerCase()
    const stemMap: Record<string, string> = { v: 'vocals', d: 'drums', b: 'bass', o: 'other' }
    const name = stemMap[stemName]
    if (name) toggleMute(name)
  }, [toggleMute])

  const seek10 = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
    seek(newTime)
  }, [currentTime, duration, seek])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.code === 'KeyC') { e.preventDefault(); setShowDegree(d => !d) }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seek10(-10) }
      if (e.code === 'ArrowRight') { e.preventDefault(); seek10(10) }
      if (e.code === 'KeyV') { e.preventDefault(); toggleStemMute('v') }
      if (e.code === 'KeyD') { e.preventDefault(); toggleStemMute('d') }
      if (e.code === 'KeyB') { e.preventDefault(); toggleStemMute('b') }
      if (e.code === 'KeyO') { e.preventDefault(); toggleStemMute('o') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlay, seek10, toggleStemMute, setShowDegree])

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

          {/* Lyrics */}
          <div>
            <Lyrics
              songId={song.id}
              currentTime={currentTime}
            />
          </div>

          {/* Chord Chart */}
          <div>
            <ChordChart
              songId={song.id}
              songTitle={song.title}
              currentTime={currentTime}
              showDegree={showDegree}
              onShowDegreeChange={setShowDegree}
              onChordData={setChordData}
            />
          </div>

          {/* Transport row */}
          <div className="px-6 py-5">
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
          <div className="flex items-center w-full px-6 py-3 mb-3">
            <button
              onClick={(e) => { e.stopPropagation(); setIsInstrumentsOpen(!isInstrumentsOpen) }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: isInstrumentsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                chevron_right
              </span>
              <span className="font-headline font-bold text-xs uppercase tracking-widest text-primary">
                Instruments
              </span>
            </button>
          </div>

          {/* Stem rows */}
          {isInstrumentsOpen && (() => {
            const anySoloed = [...stemStates.values()].some(s => s.soloed)
            return (
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
                      anySoloed={anySoloed}
                      onVolumeChange={setVolume}
                      onToggleMute={toggleMute}
                      onToggleSolo={toggleSolo}
                      onSeek={seek}
                    />
                  )
                })}
              </div>
            )
          })()}

          {/* Equalizer header */}
          <div className="flex items-center justify-between w-full px-6 py-3 mb-3">
            <button
              onClick={(e) => { e.stopPropagation(); setIsEqualizerOpen(!isEqualizerOpen) }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: isEqualizerOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                chevron_right
              </span>
              <span className="font-headline font-bold text-xs uppercase tracking-widest text-primary">
                Equalizer
              </span>
            </button>
            <select
              value={eqPreset}
              onChange={(e) => { e.stopPropagation(); handlePresetChange(e.target.value) }}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] font-headline font-bold bg-surface-container border border-white/10 rounded-lg px-3 py-1.5 text-on-surface hover:border-white/20 transition-colors cursor-pointer appearance-none pr-7"
              style={{ backgroundImage: 'none' }}
            >
              <option value="" disabled hidden></option>
              {Object.keys(EQ_PRESETS).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </div>

          {/* Equalizer controls */}
          {isEqualizerOpen && (
            <div className="px-6 py-4 border-t border-white/5">
              <Equalizer
                key={eqKey}
                onEqChange={handleEqChange}
                onUserChange={handleEqUserChange}
                initialGains={eqInitialGains}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
