import { useEffect, useMemo, useRef, useState } from 'react'
import { api, LyricsData } from '../../api/client'
import { useNotificationStore } from '../../stores/notificationStore'

interface Props {
  songId: string
  songTitle: string
  currentTime: number
}

type LyricsStatus = 'loading' | 'ready' | 'generating' | 'error' | 'unavailable'

type ProgressMessage = {
  status: 'running' | 'completed' | 'failed' | 'idle'
  message?: string
  error?: string
}

const LANGUAGES = [
  { code: 'kelvin', name: 'Vietnamese Lyrics (kelvin) #faster-whisper' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'en', name: 'English' },
]

export default function Lyrics({ songId, songTitle, currentTime }: Props) {
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
  const [language, setLanguage] = useState('kelvin')
  const [progressMsg, setProgressMsg] = useState('')
  const [karaoke, setKaraoke] = useState(() => localStorage.getItem('lyrics_karaoke') !== 'false')
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('lyrics_fontsize') || 14))
  const scrollRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const { push, update } = useNotificationStore()

  const wordCount = lyrics?.words.length ?? 0

  const phrases = useMemo(() => {
    if (!lyrics?.words.length) return []
    type W = (typeof lyrics.words)[0]
    type Phrase = { words: { word: W; globalIdx: number }[]; isPassageStart: boolean }

    const result: Phrase[] = []
    let current: Phrase['words'] = []

    lyrics.words.forEach((word, idx) => {
      if (word.is_phrase_start && current.length > 0) {
        result.push({ words: current, isPassageStart: false })
        current = []
      }
      current.push({ word, globalIdx: idx })
    })
    if (current.length > 0) result.push({ words: current, isPassageStart: false })

    for (let i = 1; i < result.length; i++) {
      const prevEnd = result[i - 1].words.at(-1)!.word.end
      const currStart = result[i].words[0].word.start
      if (currStart - prevEnd > 2.0) result[i].isPassageStart = true
    }

    return result
  }, [lyrics])

  const phraseCount = phrases.length

  const closeEs = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }

  const subscribeToProgress = () => {
    closeEs()
    const es = new EventSource(`/api/songs/${songId}/lyrics/events`)
    esRef.current = es
    es.onmessage = (event) => {
      const data: ProgressMessage = JSON.parse(event.data)
      if (data.message) setProgressMsg(data.message)
      if (data.status === 'completed') {
        setProgressMsg('')
        closeEs()
        update({ songId, type: 'processing' }, { type: 'ready', message: 'Lyrics transcribed', read: false })
        api.getLyrics(songId).then(d => {
          if (d?.lyrics?.words.length) { setLyrics(d.lyrics); setStatus('ready') }
          else setStatus('unavailable')
        })
      } else if (data.status === 'failed') {
        const errMsg = data.error || 'Transcription failed'
        setStatus('error')
        setErrorMsg(errMsg)
        closeEs()
        update({ songId, type: 'processing' }, { type: 'error', message: errMsg, read: false })
      } else if (data.status === 'idle') {
        closeEs()
      }
    }
    es.onerror = () => {
      closeEs()
      setStatus('error')
      setErrorMsg('Connection lost. Please try again.')
    }
  }

  const startGeneration = (lang: string = 'vi') => {
    setStatus('generating')
    setErrorMsg(null)
    setProgressMsg('Transcribing...')
    push({ type: 'processing', title: songTitle, message: 'Transcribing lyrics…', songId })
    api.generateLyrics(songId, lang)
      .then(() => subscribeToProgress())
      .catch((e) => {
        console.error('Failed to start transcription:', e)
        setStatus('error')
        setErrorMsg('Failed to start transcription. Please try again.')
      })
  }

  const handlePasteLyrics = async () => {
    if (!pasteText.trim()) return
    setPasting(true)
    setErrorMsg(null)
    try {
      const result = await api.setCustomLyrics(songId, pasteText, true)
      if (result.task_id) {
        setStatus('generating')
        setProgressMsg('Aligning lyrics...')
        push({ type: 'processing', title: songTitle, message: 'Aligning lyrics…', songId })
        subscribeToProgress()
      } else {
        setShowPasteModal(false)
        startGeneration()
      }
    } catch (e) {
      console.error('Failed to set custom lyrics:', e)
      setErrorMsg('Failed to set custom lyrics. Please try again.')
    } finally {
      setPasting(false)
    }
  }

  useEffect(() => {
    setLyrics(null); setStatus('loading'); closeEs(); setProgressMsg('')
    let cancelled = false

    api.getLyrics(songId)
      .then(data => {
        if (cancelled) return
        if (data.task_status === 'running') {
          setStatus('generating')
          setProgressMsg('Transcribing...')
          subscribeToProgress()
          return
        }
        if (data.task_status === 'failed') { setStatus('error'); setErrorMsg(data.error || 'Generation failed'); return }
        if ('error' in data && data.error) { setStatus('error'); setErrorMsg(data.error); return }
        if (data?.lyrics?.words.length) { setLyrics(data.lyrics); setStatus('ready') }
        else { setStatus('unavailable') }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error('Failed to load lyrics:', e)
          setStatus('error')
          setErrorMsg('Failed to load lyrics')
        }
      })

    return () => { cancelled = true; closeEs() }
  }, [songId])

  useEffect(() => {
    if (!karaoke || status !== 'ready' || !phrases.length || !scrollRef.current) return
    const activeIdx = phrases.findIndex(p =>
      p.words.some(({ word }) => currentTime >= word.start && currentTime < word.end)
    )
    if (activeIdx === -1) return
    const el = scrollRef.current.querySelector(`[data-phrase="${activeIdx}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentTime, status, phrases, karaoke])

  useEffect(() => {
    localStorage.setItem('panel_lyrics', isOpen ? 'open' : 'collapsed')
  }, [isOpen])

  useEffect(() => {
    localStorage.setItem('lyrics_karaoke', karaoke ? 'true' : 'false')
  }, [karaoke])

  useEffect(() => {
    localStorage.setItem('lyrics_fontsize', String(fontSize))
  }, [fontSize])

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
        {status === 'ready' && lyrics && isOpen && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFontSize(s => Math.max(10, s - 2))}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-bold bg-white/5 text-on-surface-variant border border-white/10 hover:border-white/20 transition-all"
              title="Decrease font size"
            >A−</button>
            <button
              onClick={() => setFontSize(s => Math.min(24, s + 2))}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-bold bg-white/5 text-on-surface-variant border border-white/10 hover:border-white/20 transition-all"
              title="Increase font size"
            >A+</button>
            <button
              onClick={() => setKaraoke(k => !k)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-label border transition-all ${
                karaoke
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-white/5 text-on-surface-variant border-white/10 hover:border-white/20'
              }`}
            >
              Karaoke
            </button>
            <button
              onClick={() => {
                setPasteText(lyrics.custom_text || lyrics.words.map(w => w.word).join(' '))
                setShowPasteModal(true)
              }}
              className="px-2.5 py-1 rounded-md text-[10px] font-label bg-white/5 text-on-surface-variant border border-white/10 hover:border-primary/40 hover:text-primary transition-all"
            >
              Edit
            </button>
            <button
              onClick={async () => {
                if (confirm('Delete lyrics?')) {
                  try {
                    await api.deleteLyrics(songId)
                  } catch (e) {
                    console.error('Failed to delete lyrics:', e)
                  }
                  setLyrics(null)
                  setStatus('unavailable')
                }
              }}
              className="px-2.5 py-1 rounded-md text-[10px] font-label bg-white/5 text-on-surface-variant border border-white/10 hover:border-error/40 hover:text-error transition-all"
            >
              Delete
            </button>
          </div>
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
                  Transcribe
                </button>
                <button onClick={() => setShowPasteModal(true)} className="px-3 py-1 rounded-md bg-secondary text-on-secondary text-[10px] font-label hover:opacity-90 transition-opacity">
                  Paste Lyrics
                </button>
              </div>
            </div>
          )}
          {status === 'generating' && (
            <div className="flex items-center gap-2 py-2 text-on-surface-variant text-xs">
              <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
              <span>{progressMsg || 'Transcribing...'}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-error text-xs">{errorMsg || 'Lyrics unavailable'}</span>
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
                  Retry
                </button>
              </div>
            </div>
          )}

          {status === 'ready' && lyrics && (() => {
            const activePhraseIdx = phrases.findIndex(p =>
              p.words.some(({ word }) => currentTime >= word.start && currentTime < word.end)
            )
            return (
              <div ref={scrollRef} className="py-4 px-2 max-h-40 overflow-y-auto text-center" style={{ fontSize }}>
                {phrases.map((phrase, phraseIdx) => (
                  <div
                    key={phraseIdx}
                    data-phrase={phraseIdx}
                    className={`flex flex-wrap justify-center gap-x-1.5 ${
                      phrase.isPassageStart ? 'mt-5' : phraseIdx > 0 ? 'mt-1' : ''
                    }`}
                  >
                    {phrase.words.map(({ word, globalIdx }) => {
                      const isCurrent = currentTime >= word.start && currentTime < word.end
                      const isSung = currentTime >= word.end
                      const inActivePhrase = phraseIdx === activePhraseIdx
                      const cls = isCurrent
                        ? 'bg-primary/30 text-primary font-bold rounded px-0.5'
                        : inActivePhrase && isSung
                        ? 'bg-white/10 text-on-surface/70 rounded px-0.5'
                        : isSung
                        ? 'text-on-surface/40'
                        : 'text-on-surface-variant'
                      return (
                        <span
                          key={globalIdx}
                          data-index={globalIdx}
                          className={`transition-colors duration-150 ${cls}`}
                        >
                          {word.word}
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })()}
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