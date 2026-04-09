import { useNavigate, useLocation } from 'react-router-dom'
import { usePlayer } from '../../contexts/PlayerContext'
import { formatTime } from '../../utils/time'

export default function MiniPlayer() {
  const { song, isPlaying, isReady, currentTime, duration, togglePlay } = usePlayer()
  const navigate = useNavigate()
  const location = useLocation()

  // Don't render if no song loaded, or we're already on the player page for this song
  if (!song) return null
  if (location.pathname === `/player/${song.id}`) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/5 h-16 px-6 flex items-center gap-4">
      {/* Thumbnail — click to expand */}
      <div
        className="flex-shrink-0 cursor-pointer"
        onClick={() => navigate(`/player/${song.id}`)}
      >
        {song.thumbnail_url ? (
          <img
            src={song.thumbnail_url}
            alt={song.title}
            className="w-10 h-10 rounded-lg object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-sm">music_note</span>
          </div>
        )}
      </div>

      {/* Song info */}
      <div
        className="flex-shrink-0 w-40 min-w-0 cursor-pointer"
        onClick={() => navigate(`/player/${song.id}`)}
      >
        <p className="text-sm font-bold font-headline truncate text-on-surface">{song.title}</p>
        {song.artist && (
          <p className="text-xs text-on-surface-variant truncate">{song.artist}</p>
        )}
      </div>

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        disabled={!isReady}
        className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-primary hover:bg-surface-container-high transition-colors disabled:opacity-40"
      >
        <span
          className="material-symbols-outlined text-lg"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {isPlaying ? 'pause' : 'play_arrow'}
        </span>
      </button>

      {/* Progress bar + timestamps */}
      <div className="hidden md:flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs text-tertiary font-label w-9 text-right tabular-nums flex-shrink-0">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-secondary to-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-outline font-label w-9 tabular-nums flex-shrink-0">
          {formatTime(duration)}
        </span>
      </div>

      {/* Expand button */}
      <button
        onClick={() => navigate(`/player/${song.id}`)}
        className="flex-shrink-0 text-on-surface-variant hover:text-primary transition-colors"
        title="Open full player"
      >
        <span className="material-symbols-outlined">open_in_full</span>
      </button>
    </div>
  )
}
