import { useEffect, useMemo, useRef, useState } from 'react'
import { api, LyricsData } from '../../api/client'

interface Props {
  songId: string
  currentTime: number
}

type LyricsStatus = 'loading' | 'ready' | 'generating' | 'error' | 'unavailable'

export default function Lyrics({ songId, currentTime }: Props) {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [status, setStatus] = useState<LyricsStatus>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const wordCount = lyrics?.words.length ?? 0
  const phraseCount = useMemo(() => {
    if (!lyrics?.words.length) return 0
    const phraseStarts = lyrics.words.filter(w => w.is_phrase_start)
    return phraseStarts.length > 0 ? phraseStarts.length : Math.ceil(lyrics.words.length / 8)
  }, [lyrics])

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startGeneration = () => {
    setStatus('generating')
    pollRef.current = setInterval(() => {
      api.getLyrics(songId).then(data => {
        stopPoll()
        if (!data) return
        if ('error' in data && data.error) { setStatus('error'); setErrorMsg(data.error); return }
        if (data.lyrics?.words.length) { setLyrics(data.lyrics); setStatus('ready') }
        else { setStatus('unavailable') }
      }).catch(() => {})
    }, 3000)
    api.generateLyrics(songId).catch(() => {})
  }

  useEffect(() => {
    setLyrics(null); setStatus('loading'); stopPoll()
    let cancelled = false

    api.getLyrics(songId)
      .then(data => {
        if (cancelled) return
        if ('error' in data && data.error) { setStatus('error'); setErrorMsg(data.error); return }
        if (data?.lyrics?.words.length) { setLyrics(data.lyrics); setStatus('ready') }
        else { setStatus('unavailable') }
      })
      .catch(() => { if (!cancelled) setStatus('error') })

    return () => { cancelled = true; stopPoll() }
  }, [songId])

  useEffect(() => {
    if (status !== 'ready' || !lyrics?.words.length || !scrollRef.current) return
    const words = lyrics.words
    const idx = words.findIndex(w => currentTime >= w.start && currentTime < w.end)
    if (idx === -1) return
    const el = scrollRef.current.querySelector(`[data-index="${idx}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentTime, status, lyrics])

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              chevron_right
            </span>
            <span className="font-headline font-bold text-xs uppercase tracking-widest text-primary">
              Lyrics
            </span>
          </button>
          {status === 'ready' && lyrics && isOpen && (
            <span className="text-[10px] font-label text-on-surface-variant/70 tabular-nums px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
              {wordCount} words · {phraseCount} phrases
            </span>
          )}
        </div>
      </div>

      {status === 'loading' && (
        <div className="h-16 flex items-center justify-center">
          <span className="material-symbols-outlined text-xl text-primary animate-spin">progress_activity</span>
        </div>
      )}
      {status === 'unavailable' && (
        <div className="h-10 flex items-center justify-center gap-2 text-on-surface-variant text-xs">
          <span>Lyrics unavailable.</span>
          <button onClick={startGeneration} className="px-3 py-1 rounded-md bg-primary text-on-primary text-[10px] font-label hover:opacity-90 transition-opacity">
            Generate
          </button>
        </div>
      )}
      {status === 'generating' && (
        <div className="h-16 flex items-center justify-center gap-2 text-on-surface-variant text-sm">
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          Transcribing...
        </div>
      )}
      {status === 'error' && (
        <div className="h-10 flex items-center justify-center text-on-surface-variant text-xs">
          {errorMsg || 'Lyrics unavailable'}
        </div>
      )}

      {status === 'ready' && lyrics && isOpen && (
        <div ref={scrollRef} className="flex flex-wrap gap-x-3 gap-y-1 py-4 px-2 max-h-40 overflow-y-auto justify-center text-center">
          {lyrics.words.map((word, idx) => (
            <span
              key={idx}
              data-index={idx}
              className={`transition-all duration-150 ${
                currentTime >= word.start && currentTime < word.end
                  ? 'text-primary font-bold text-lg scale-110'
                  : currentTime >= word.end
                  ? 'text-on-surface/40'
                  : 'text-on-surface-variant'
              }`}
            >
              {word.is_phrase_start ? '\n' : ''}{word.word}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}