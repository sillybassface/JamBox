import { useEffect, useState, useRef } from 'react'
import { api, LyricsData, Task } from '../../api/client'

interface Props {
  songId: string
  currentTime: number
}

type LyricsStatus = 'loading' | 'ready' | 'processing' | 'error' | 'empty'

export default function Lyrics({ songId, currentTime }: Props) {
  const [status, setStatus] = useState<LyricsStatus>('loading')
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('Starting...')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load lyrics or check status
  useEffect(() => {
    let cancelled = false

    async function loadLyrics() {
      setStatus('loading')
      setTaskError(null)
      try {
        const data = await api.getLyrics(songId)
        if (cancelled) return

        if (!data.lyrics) {
          setStatus('empty')
          return
        }

        setLyrics(data.lyrics)
        setStatus('ready')
      } catch (e) {
        if (!cancelled) setStatus('error')
      }
    }

    loadLyrics()

    return () => {
      cancelled = true
    }
  }, [songId])

  // Poll task for progress when processing
  useEffect(() => {
    if (status !== 'processing') return

    let cancelled = false

    async function startPolling() {
      try {
        const result = await api.generateLyrics(songId)
        if (cancelled) return

        if (result.task_id) {
          pollTask(result.task_id)
        } else if (result.status === 'already_processed') {
          const data = await api.getLyrics(songId)
          setLyrics(data.lyrics)
          setStatus('ready')
        }
      } catch (e) {
        if (!cancelled) setStatus('error')
      }
    }

    async function pollTask(id: string) {
      try {
        const task: Task = await api.getTask(id)
        if (cancelled) return

        if (task.status === 'completed') {
          const data = await api.getLyrics(songId)
          setLyrics(data.lyrics)
          setStatus('ready')
        } else if (task.status === 'failed') {
          setTaskError(task.error || 'Failed to process lyrics')
          setStatus('error')
        } else if (task.status === 'running') {
          setProgressMsg(task.step === 'transcribing' ? 'Transcribing audio...' : 'Processing...')
          setTimeout(() => pollTask(id), 1500)
        }
      } catch (e) {
        if (!cancelled) setStatus('error')
      }
    }

    startPolling()

    return () => {
      cancelled = true
    }
  }, [status, songId])

  // Auto-scroll to current word
  useEffect(() => {
    if (status !== 'ready' || !lyrics?.words.length || !scrollRef.current) return

    const words = lyrics.words
    const currentWordIdx = words.findIndex(
      w => currentTime >= w.start && currentTime < w.end
    )

    if (currentWordIdx === -1) return

    const wordEl = scrollRef.current.querySelector(`[data-index="${currentWordIdx}"]`)
    if (!wordEl) return

    wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentTime, status, lyrics])

  const handleRetry = () => {
    setStatus('empty')
    setTaskError(null)
  }

  // Error UI
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <span className="text-error text-sm text-center px-4">
          {taskError || 'Failed to process lyrics'}        
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-label hover:bg-primary/20 transition-colors"
          >
            Try Again
          </button>?
        </span>
      </div>
    )
  }

  // Loading UI
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-symbols-outlined text-tertiary animate-spin mr-2">
          progress_activity
        </span>
        <span className="text-on-surface-variant text-sm">Loading lyrics...</span>
      </div>
    )
  }

  // Processing UI
  if (status === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="flex items-center">
          <span className="material-symbols-outlined text-tertiary animate-spin mr-2">
            progress_activity
          </span>
          <span className="text-on-surface-variant text-sm">{progressMsg}</span>
        </div>
        <p className="text-on-surface-variant/60 text-xs">
          This takes about a minute
        </p>
      </div>
    )
  }

  // Empty UI - prompt to generate
  if (status === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <span className="text-on-surface-variant text-sm">No lyrics available for this song
          <button
            onClick={() => setStatus('processing')}
            className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-label hover:bg-primary/20 transition-colors"
          >
            Generate Lyrics
          </button>?
        </span>
      </div>
    )
  }

  // Ready - karaoke display
  return (
    <div
      ref={scrollRef}
      className="flex flex-wrap gap-x-3 gap-y-1 py-8 px-6 max-h-48 overflow-y-auto justify-center text-center"
    >
      {lyrics?.words.map((word, idx) => (
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
          {word.word}
        </span>
      ))}
    </div>
  )
}