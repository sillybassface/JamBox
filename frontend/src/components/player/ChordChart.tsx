import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ChordData } from '../../api/client'
import ChordChartGrid from './ChordChartGrid'

interface Props {
  songId: string
  currentTime: number
  duration: number
  showDegree?: boolean
  onShowDegreeChange?: (show: boolean) => void
}

export default function ChordChart({ songId, currentTime, duration, showDegree: externalShowDegree, onShowDegreeChange }: Props) {
  const [chordData, setChordData] = useState<ChordData | null>(null)
  const [status, setStatus] = useState<'loading' | 'generating' | 'ready' | 'error'>('loading')
  const [internalShowDegree, setInternalShowDegree] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const showDegree = externalShowDegree ?? internalShowDegree
  const setShowDegree = onShowDegreeChange ?? setInternalShowDegree
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    setChordData(null); setStatus('loading'); stopPoll()
    let cancelled = false

    api.getChords(songId)
      .then(data => {
        if (cancelled) return
        if (data) {
          if (data.error) { setStatus('error'); return }
          setChordData(data); setStatus('ready')
        } else {
          api.generateChords(songId).catch(() => {})
          setStatus('generating')
          pollRef.current = setInterval(() => {
            api.getChords(songId).then(d => {
              if (cancelled || !d) return
              stopPoll()
              if (d.error) { setStatus('error'); return }
              setChordData(d); setStatus('ready')
            }).catch(() => {})
          }, 3000)
        }
      })
      .catch(() => { if (!cancelled) setStatus('error') })

    return () => { cancelled = true; stopPoll() }
  }, [songId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="px-6 py-4">
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
          {status === 'ready' && chordData && isOpen && (
            <span className="text-[10px] font-label text-on-surface-variant/70 tabular-nums px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
              {chordData.key} · {Math.round(chordData.tempo)} BPM · {chordData.time_signature}/4
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

      {status === 'loading' && (
        <div className="h-16 flex items-center justify-center">
          <span className="material-symbols-outlined text-xl text-primary animate-spin">progress_activity</span>
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

      {status === 'ready' && chordData && isOpen && (
        <ChordChartGrid
          measures={chordData.measures}
          timeSig={chordData.time_signature}
          currentTime={currentTime}
          songKey={chordData.key}
          showDegree={showDegree}
        />
      )}
    </div>
  )
}
