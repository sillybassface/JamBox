import { formatTime } from '../../utils/time'

/**
 * TransportControls
 *
 * Column layout mirrors StemRow exactly so the progress bar aligns with waveforms:
 *
 *  [w-[8.75rem] controls]  [flex-1 bar]  [w-40 volume]
 *
 * StemRow: [w-16 label] + gap-4 + [w-[3.75rem] M/S] + gap-4 + [flex-1 wave] + gap-4 + [w-40 vol]
 * Here the two left fixed columns collapse into one: 4rem + 0.75rem (gap) + 3.75rem = 8.5rem... but
 * the gap between them in StemRow is a flex gap not extra width, so the left edge of flex-1
 * in StemRow sits at:  64px (w-16) + 16px (gap) + 60px (w-[3.75rem]) + 16px (gap) = 156px = 9.75rem.
 * Here: 8.75rem (w-[8.75rem]) + 16px (gap) = 156px. ✓ Exactly aligned.
 */

interface Props {
  isPlaying: boolean
  isReady: boolean
  currentTime: number
  duration: number
  masterVolume: number
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onSeekRelative: (delta: number) => void
  onMasterVolumeChange: (v: number) => void
}

export default function TransportControls({
  isPlaying, isReady, currentTime, duration,
  masterVolume,
  onTogglePlay, onSeek, onSeekRelative, onMasterVolumeChange,
}: Props) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col gap-2 w-full">

      {/* ── Transport row ── */}
      <div className="flex items-center gap-4">

        {/* Left: skip-back + play + skip-forward
            Width = w-16 + w-[3.75rem] collapsed = w-[8.75rem]
            so flex-1 below starts at the same x as stem waveforms */}
        <div className="flex items-center gap-1 w-[8.75rem] flex-shrink-0 justify-start">
          <button
            onClick={() => onSeekRelative(-10)}
            disabled={!isReady}
            className="text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40 p-1"
            title="Back 10s"
          >
            <span className="material-symbols-outlined text-xl">replay_10</span>
          </button>

          <button
            onClick={onTogglePlay}
            disabled={!isReady}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-primary-container flex items-center justify-center text-on-primary-fixed shadow-[0_0_20px_rgba(219,144,255,0.4)] hover:shadow-[0_0_35px_rgba(219,144,255,0.6)] transition-all active:scale-90 disabled:opacity-40 flex-shrink-0"
          >
            {isReady ? (
              <span
                className="material-symbols-outlined text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            ) : (
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            )}
          </button>

          <button
            onClick={() => onSeekRelative(10)}
            disabled={!isReady}
            className="text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40 p-1"
            title="Forward 10s"
          >
            <span className="material-symbols-outlined text-xl">forward_10</span>
          </button>
        </div>

        {/* Centre: progress bar — flex-1, same column as stem waveforms */}
        <div
          className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden cursor-pointer relative group"
          onClick={(e) => {
            if (!isReady) return
            const rect = e.currentTarget.getBoundingClientRect()
            onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration)
          }}
        >
          <div
            className="h-full bg-gradient-to-r from-secondary to-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-surface shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>

        {/* Right: master volume — w-40, matches stem volume column */}
        <div className="flex items-center gap-2 w-40 flex-shrink-0">
          <span className="material-symbols-outlined text-sm flex-shrink-0 text-primary">
            {masterVolume === 0 ? 'volume_off' : masterVolume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
          <div
            className="relative flex-1 h-1.5 bg-surface-container-highest rounded-full group cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              onMasterVolumeChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
            }}
          >
            <div
              className="h-full rounded-full transition-all bg-primary"
              style={{ width: `${masterVolume * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-surface shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${masterVolume * 100}% - 6px)` }}
            />
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={masterVolume}
              onChange={e => onMasterVolumeChange(parseFloat(e.target.value))}
              aria-label="Master volume"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
          <span className="text-[10px] font-label text-on-surface-variant w-8 text-right tabular-nums flex-shrink-0">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>
      </div>

      {/* ── Time + hint row ── */}
      <div className="flex items-center gap-4">
        {/* Under the controls */}
        <div className="w-[8.75rem] flex-shrink-0 text-center text-[10px] font-label text-on-surface-variant/40 uppercase tracking-widest">
          Space · play/pause
        </div>
        {/* Under the bar: timestamps at the edges */}
        <div className="flex-1 flex items-center justify-between">
          <span className="text-xs font-label text-tertiary tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] font-label text-on-surface-variant/40 uppercase tracking-widest">
            ← → seek 5s
          </span>
          <span className="text-xs font-label text-outline tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
        {/* Under master volume */}
        <div className="w-40 flex-shrink-0 text-center text-[10px] font-label text-on-surface-variant/40 uppercase tracking-widest">
          Master vol
        </div>
      </div>

    </div>
  )
}
