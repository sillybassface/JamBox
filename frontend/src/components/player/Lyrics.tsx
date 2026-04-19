import { useEffect, useMemo, useRef, useState } from 'react'
import { api, LyricsData } from '../../api/client'

interface Props {
  songId: string
  currentTime: number
}

type LyricsStatus = 'loading' | 'ready' | 'generating' | 'error' | 'unavailable'

const LANGUAGES = [
  { code: 'vi', name: 'Vietnamese' },
  { code: 'en', name: 'English' },
]

export default function Lyrics({ songId, currentTime }: Props) {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [status, setStatus] = useState<LyricsStatus>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('panel_lyrics')
    return saved !== 'collapsed'
  })
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasting, setPasting] = useState(false)
  const [language, setLanguage] = useState('vi')
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

  const startGeneration = (lang: string = 'vi') => {
    setStatus('generating')
    pollRef.current = setInterval(() => {
      api.getLyrics(songId).then(data => {
        if (!data) return
        if (data.task_status === 'running') return
        if (data.task_status === 'failed') { setStatus('error'); setErrorMsg(data.error || 'Generation failed'); stopPoll(); return }
        stopPoll()
        if (data.lyrics?.words.length) { setLyrics(data.lyrics); setStatus('ready') }
        else { setStatus('unavailable') }
      }).catch(() => {})
    }, 3000)
    api.generateLyrics(songId, lang).catch(() => {})
  }

  const handlePasteLyrics = async () => {
    if (!pasteText.trim()) return
    setPasting(true)
    try {
      const result = await api.setCustomLyrics(songId, pasteText, true)
      if (result.task_id) {
        pollRef.current = setInterval(() => {
          api.getLyrics(songId).then(data => {
            if (data.task_status === 'running') return
            if (data.task_status === 'failed') { setStatus('error'); setErrorMsg(data.error || 'Generation failed'); stopPoll(); return }
            stopPoll()
            if (data.lyrics?.words.length) {
              setLyrics(data.lyrics)
              setStatus('ready')
              setShowPasteModal(false)
              setPasteText('')
            }
          }).catch(() => {})
        }, 2000)
      } else {
        setShowPasteModal(false)
        startGeneration()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setPasting(false)
    }
  }

  useEffect(() => {
    setLyrics(null); setStatus('loading'); stopPoll()
    let cancelled = false

    api.getLyrics(songId)
      .then(data => {
        if (cancelled) return
        if (data.task_status === 'running') { setStatus('generating'); return }
        if (data.task_status === 'failed') { setStatus('error'); setErrorMsg(data.error || 'Generation failed'); return }
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

  useEffect(() => {
    localStorage.setItem('panel_lyrics', isOpen ? 'open' : 'collapsed')
  }, [isOpen])

  return (
    <div className="px-6 py-3">
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

      {isOpen && (
        <>
          {status === 'loading' && (
            <div className="h-16 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-primary animate-spin">progress_activity</span>
            </div>
          )}
          {status === 'unavailable' && (
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-on-surface-variant text-xs">Lyrics unavailable.</span>
              <div className="flex items-center gap-2">
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="px-2 py-1 rounded-md bg-surface-container text-on-surface text-[10px] font-label border border-white/10 focus:border-primary focus:outline-none"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
                <button onClick={() => startGeneration(language)} className="px-3 py-1 rounded-md bg-primary text-on-primary text-[10px] font-label hover:opacity-90 transition-opacity">
                  Generate
                </button>
                <button onClick={() => setShowPasteModal(true)} className="px-3 py-1 rounded-md bg-secondary text-on-secondary text-[10px] font-label hover:opacity-90 transition-opacity">
                  Paste Lyrics
                </button>
              </div>
            </div>
          )}
          {status === 'ready' && lyrics && (
            <div className="flex justify-end gap-2">
              <button onClick={() => {
                setPasteText(lyrics.custom_text || lyrics.words.map(w => w.word).join(' '))
                setShowPasteModal(true)
              }} className="text-[10px] text-on-surface-variant hover:text-primary px-2 py-1">
                Edit
              </button>
              <button onClick={async () => {
                if (confirm('Delete lyrics and regenerate?')) {
                  await api.deleteLyrics(songId)
                  startGeneration(language)
                }
              }} className="text-[10px] text-on-surface-variant hover:text-error px-2 py-1">
                Delete
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

          {status === 'ready' && lyrics && (
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
        </>
      )}

      {showPasteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPasteModal(false)}>
          <div className="bg-surface-container rounded-xl p-4 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline font-bold text-primary">Paste Lyrics</h3>
              <button onClick={() => setShowPasteModal(false)} className="text-on-surface-variant hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant mb-2">
              Paste lyrics text below. Timing will be inferred from Whisper.
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              className="w-full h-48 bg-surface-container-low rounded-lg p-3 text-sm text-on-surface border border-white/10 focus:border-primary focus:outline-none resize-none font-mono"
              placeholder="Paste lyrics here (one word per line or space-separated)..."
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteLyrics}
                disabled={pasting || !pasteText.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-label hover:opacity-90 disabled:opacity-50"
              >
                {pasting ? 'Processing...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}