import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ChordData } from '../../api/client'
import ChordChartGrid from './ChordChartGrid'
import { useNotificationStore } from '../../stores/notificationStore'

interface Props {
  songId: string
  songTitle: string
  currentTime: number
  showDegree?: boolean
  onShowDegreeChange?: (show: boolean) => void
  onChordData?: (data: ChordData) => void
}

export default function ChordChart({ songId, songTitle, currentTime, showDegree: externalShowDegree, onShowDegreeChange, onChordData }: Props) {
  const [chordData, setChordData] = useState<ChordData | null>(null)
  const [status, setStatus] = useState<'loading' | 'unavailable' | 'generating' | 'ready' | 'error'>('loading')
  const [internalShowDegree, setInternalShowDegree] = useState(false)
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('panel_chords')
    return saved !== 'collapsed'
  })
  const showDegree = externalShowDegree ?? internalShowDegree
  const setShowDegree = onShowDegreeChange ?? setInternalShowDegree

  // Resolve active section from playhead position
  const activeSection = useMemo(() => {
    if (!chordData?.sections?.length) return null
    for (const s of chordData.sections) {
      if (currentTime >= s.start && currentTime < s.end) return s
    }
    return chordData.sections[chordData.sections.length - 1]
  }, [chordData, currentTime])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pushNotif = useNotificationStore(s => s.push)
  const updateNotif = useNotificationStore(s => s.update)

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startGeneration = useCallback(() => {
    setStatus('generating')
    pushNotif({ type: 'processing', title: songTitle, message: `Generating chords for "${songTitle}"…`, songId })
    pollRef.current = setInterval(() => {
      api.getChords(songId).then(d => {
        if (!d) return
        stopPoll()
        if (d.error) {
          setStatus('error')
          updateNotif(
            { songId, type: 'processing' },
            { type: 'error', message: `Error: failed to generate chords for "${songTitle}"`, read: false },
          )
          return
        }
        setChordData(d); setStatus('ready')
        onChordData?.(d)
        updateNotif(
          { songId, type: 'processing' },
          { type: 'ready', message: `Generated chords for "${songTitle}".`, read: false },
        )
      }).catch(() => {})
    }, 3000)
    api.generateChords(songId).catch(() => {})
  }, [songId, songTitle, songId, pushNotif, stopPoll, updateNotif, onChordData])

  useEffect(() => {
    setChordData(null); setStatus('loading'); stopPoll()
    let cancelled = false

    api.getChords(songId)
      .then(data => {
        if (cancelled) return
        if (data) {
          if (data.error) { setStatus('error'); return }
          setChordData(data); setStatus('ready')
          onChordData?.(data)
        } else {
          setStatus('unavailable')
        }
      })
      .catch(() => { if (!cancelled) setStatus('error') })

    return () => { cancelled = true; stopPoll() }
  }, [songId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('panel_chords', isOpen ? 'open' : 'collapsed')
  }, [isOpen])

  return (
    <div className="px-6 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              chevron_right
            </span>
            <span className="font-headline font-bold text-xs uppercase tracking-widest text-primary">
              Chord Chart
            </span>
          </button>
          {status === 'ready' && chordData && activeSection && isOpen && (
            <span className="text-[10px] font-label text-on-surface-variant/70 tabular-nums px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
              {chordData.key} · {Math.round(chordData.global_tempo)} · {activeSection.time_sig.num}/{activeSection.time_sig.den}
            </span>
          )}
        </div>
        {status === 'ready' && isOpen && (
          <label className="flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-all">
            <div className="relative">
              <input
                type="checkbox"
                checked={showDegree}
                onChange={(e) => setShowDegree(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-white/20 rounded-full peer-checked:bg-primary transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-3" />
            </div>
            <span className="text-xs font-label text-on-surface-variant">Degree</span>
          </label>
        )}
      </div>

      {isOpen && (
        <>
          {status === 'loading' && (
            <div className="h-16 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-primary animate-spin">progress_activity</span>
            </div>
          )}
          {status === 'unavailable' && (
            <div className="h-10 flex items-center justify-center gap-2 text-on-surface-variant text-xs">
              <span>Chord analysis unavailable.</span>
              <button
                onClick={startGeneration}
                className="px-3 py-1 rounded-md bg-primary text-on-primary text-[10px] font-label hover:opacity-90 transition-opacity"
              >
                Generate
              </button>
            </div>
          )}
          {status === 'generating' && (
            <div className="h-16 flex items-center justify-center gap-2 text-on-surface-variant text-sm">
              <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
              Detecting chords…
            </div>
          )}
          {status === 'error' && (
            <div className="h-10 flex items-center justify-center text-on-surface-variant text-xs">
              Chord analysis unavailable
            </div>
          )}

          {status === 'ready' && chordData && (
            <ChordChartGrid
              measures={chordData.measures}
              sections={chordData.sections}
              currentTime={currentTime}
              songKey={chordData.key}
              showDegree={showDegree}
            />
          )}
        </>
      )}
    </div>
  )
}
