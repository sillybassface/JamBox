import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, Song } from '../api/client'
import TaskProgress from '../components/common/TaskProgress'
import { usePlayer } from '../contexts/PlayerContext'
import { useNotificationStore } from '../stores/notificationStore'
import { useTaskWebSocket } from '../hooks/useTaskPolling'

/** Inner component so we can use the WS hook conditionally after taskId is set. */
function TaskWatcher({ taskId }: { taskId: string }) {
  const { update } = useNotificationStore()
  const lastStep = useRef<string>('')

  const STEP_LABELS: Record<string, string> = {
    downloading: 'Downloading audio…',
    separating:  'Separating stems with AI…',
    converting:  'Converting to MP3…',
    waveform:    'Generating waveforms…',
  }

  useTaskWebSocket(taskId, (event) => {
    const step = event.step ?? ''
    if (step && STEP_LABELS[step] && step !== lastStep.current) {
      lastStep.current = step
      update({ taskId }, { type: 'processing', message: STEP_LABELS[step] })
    }
  })

  return null
}

export default function AddSongPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [song, setSong] = useState<Song | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { loadSong: setCurrentSong } = usePlayer()
  const { push, update } = useNotificationStore()

  // Restore in-progress task when arriving from a notification click
  useEffect(() => {
    const state = location.state as { taskId?: string; songId?: string } | null
    if (!state?.taskId || !state?.songId) return
    api.getSong(state.songId).then(s => {
      setSong(s)
      setTaskId(state.taskId!)
      if (s.status === 'ready') setDone(true)
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setSong(null)
    setTaskId(null)
    setDone(false)

    try {
      const result = await api.addSong(url.trim())
      setSong(result.song)
      setTaskId(result.task_id)
      push({
        type: 'queued',
        title: result.song.title,
        message: 'Queued for processing',
        songId: result.song.id,
        taskId: result.task_id,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add song'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    setDone(true)
    if (taskId) update({ taskId }, { type: 'ready', message: 'Added to your library — tap to open in the player' })
    if (song) {
      const updated = await api.getSong(song.id).catch(() => null)
      if (updated) setSong(updated)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      {/* TaskWatcher lives outside the visible tree so it survives navigation */}
      {taskId && !done && (
        <TaskWatcher taskId={taskId} />
      )}

      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-headline text-4xl font-bold tracking-tighter text-on-background">
          Add a Song
        </h1>
      </div>

      {/* Form */}
      {!taskId && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-outline material-symbols-outlined pointer-events-none">link</span>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={loading || !!taskId}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-4 pl-12 pr-4 text-sm font-body focus:outline-none focus:ring-1 focus:ring-secondary transition-all disabled:opacity-60 placeholder:text-on-surface-variant/40"
            />
          </div>

          {error && (
            <p className="text-error text-sm font-label flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !!taskId || !url.trim()}
            className="w-full bg-secondary text-on-secondary py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,227,253,0.3)] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                Fetching info...
              </>
            ) : (
              <>
                Add Song
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Song info + progress */}
      {song && (
        <div className="bg-surface-container rounded-2xl p-6 space-y-6 border border-white/5">
          <div className="flex items-start gap-4">
            {song.thumbnail_url ? (
              <img
                src={song.thumbnail_url}
                alt={song.title}
                className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-3xl text-primary">music_note</span>
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-headline font-bold text-xl leading-tight text-on-surface">{song.title}</h3>
              {song.artist && <p className="text-on-surface-variant text-sm mt-1">{song.artist}</p>}
              {song.duration_secs && (
                <p className="text-tertiary text-xs font-label mt-2 uppercase tracking-widest">
                  {Math.floor(song.duration_secs / 60)}:{String(Math.floor(song.duration_secs % 60)).padStart(2, '0')}
                </p>
              )}
            </div>
          </div>

          {taskId && !done && (
            <TaskProgress
              taskId={taskId}
              onComplete={handleComplete}
              onError={(err) => {
                setError(err)
                if (taskId) update({ taskId }, { type: 'error', message: err ?? 'Could not process this track' })
              }}
            />
          )}

          {song.status === 'ready' && (
            <div className="pt-4">
              <button
                onClick={() => { setCurrentSong(song); navigate(`/player/${song.id}`) }}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed py-3 rounded-xl font-bold hover:shadow-[0_0_20px_rgba(219,144,255,0.4)] transition-all flex items-center justify-center gap-2"
              >
                Open Song
                <span className="material-symbols-outlined text-sm">play_arrow</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="space-y-4 pt-4 border-t border-white/5">
        <h3 className="font-headline font-bold text-sm uppercase tracking-widest text-on-surface-variant">How it works</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: 'download', label: 'Download', desc: 'Audio extracted from YouTube' },
            { icon: 'psychology', label: 'AI Separation', desc: 'Demucs neural separation' },
            { icon: 'tune', label: 'Stems Ready', desc: 'Vocals, drums, bass, guitar' },
            { icon: 'headphones', label: 'Practice', desc: 'Mix and isolate any stem' },
          ].map((step) => (
            <div key={step.label} className="flex items-start gap-3 p-4 bg-surface-container-high rounded-xl">
              <span className="material-symbols-outlined text-secondary text-xl flex-shrink-0">{step.icon}</span>
              <div>
                <p className="text-xs font-headline font-bold uppercase tracking-widest text-on-surface">{step.label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
