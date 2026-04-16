import { useState } from 'react'
import { StemState } from '../../hooks/useCustomAudioPlayer'

interface Props {
  stem: StemState
  currentTime: number
  duration: number
  anySoloed: boolean
  onVolumeChange: (name: string, vol: number) => void
  onToggleMute: (name: string) => void
  onToggleSolo: (name: string) => void
  onSeek: (time: number) => void
}

export default function StemRow({ stem, currentTime, duration, anySoloed, onVolumeChange, onToggleMute, onToggleSolo, onSeek }: Props) {
  const { name, volume, muted, soloed, peaks, color } = stem
  const dimmed = anySoloed && !soloed
  const [hoverPct, setHoverPct] = useState<number | null>(null)

  // Downsample to ~150 bars — dense enough to look like a real waveform
  const BAR_COUNT = 150
  const previewPeaks = peaks.length > 0
    ? Array.from({ length: BAR_COUNT }, (_, i) => {
        const src = Math.floor((i / BAR_COUNT) * peaks.length)
        return peaks[src] ?? 0
      })
    : Array.from({ length: BAR_COUNT }, (_, i) => 0.15 + 0.5 * Math.abs(Math.sin(i * 0.3)))
  const maxPeak = Math.max(...previewPeaks, 0.01)

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div
      className={`flex items-center gap-4 px-6 py-4 transition-all ${
        soloed ? 'bg-primary/5' : muted ? 'bg-surface-container-low/50' : 'hover:bg-surface-container-high/30'
      } ${dimmed ? 'opacity-35' : 'opacity-100'}`}
    >
      {/* Stem label — w-16 */}
      <div className="w-16 flex-shrink-0">
        <span
          className="text-[11px] font-headline font-bold uppercase tracking-widest"
          style={{ color: muted ? '#48474a' : color }}
        >
          {name}
        </span>
      </div>

      {/* M / S buttons — w-[3.75rem] */}
      <div className="flex gap-1 w-[3.75rem] flex-shrink-0">
        <button
          onClick={() => onToggleMute(name)}
          title="Mute"
          className={`w-7 h-7 rounded text-[10px] font-bold transition-all ${
            muted
              ? 'bg-error/30 text-error ring-1 ring-error/50'
              : 'bg-surface-container-highest text-on-surface-variant hover:bg-error/20 hover:text-error'
          }`}
        >
          M
        </button>
        <button
          onClick={() => onToggleSolo(name)}
          title="Solo"
          className={`w-7 h-7 rounded text-[10px] font-bold transition-all ${
            soloed
              ? 'bg-primary/30 text-primary ring-1 ring-primary/50'
              : 'bg-surface-container-highest text-on-surface-variant hover:bg-yellow-500/20 hover:text-yellow-400'
          }`}
        >
          S
        </button>
      </div>

      {/* Waveform — flex-1, vertically aligned with progress bar above */}
      <div
        className="flex-1 relative h-12 overflow-hidden flex items-center gap-px cursor-pointer"
        onClick={(e) => {
          if (!duration) return
          const rect = e.currentTarget.getBoundingClientRect()
          onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration)
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setHoverPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
        }}
        onMouseLeave={() => setHoverPct(null)}
      >
        {previewPeaks.map((p, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max(3, (p / maxPeak) * 100)}%`,
              backgroundColor: color,
              opacity: muted ? 0.12 : soloed ? 1 : 0.5,
            }}
          />
        ))}

        {/* Played region overlay — dims bars to the left of the cursor */}
        {progress > 0 && (
          <div
            className="absolute inset-y-0 left-0 pointer-events-none"
            style={{
              width: `${progress * 100}%`,
              background: `linear-gradient(to right, ${color}55, ${color}33)`,
            }}
          />
        )}

        {/* Playback position cursor */}
        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 rounded-full pointer-events-none"
            style={{
              left: `${progress * 100}%`,
              backgroundColor: 'white',
              opacity: 0.85,
              boxShadow: `0 0 6px 2px rgba(255,255,255,0.35), 0 0 2px 0px ${color}`,
              transform: 'translateX(-50%)',
            }}
          />
        )}

        {/* Hover seek preview line */}
        {hoverPct !== null && duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px pointer-events-none"
            style={{
              left: `${hoverPct * 100}%`,
              backgroundColor: 'white',
              opacity: 0.4,
              transform: 'translateX(-50%)',
            }}
          />
        )}
      </div>

      {/* Volume slider — w-40 */}
      <div className="flex items-center gap-2 w-40 flex-shrink-0">
        <span
          className="material-symbols-outlined text-sm flex-shrink-0"
          style={{ color: muted ? '#48474a' : color }}
        >
          {muted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
        </span>

        <div
          className="relative flex-1 h-1.5 bg-surface-container-highest rounded-full group cursor-pointer"
          onClick={(e) => {
            if (muted) return
            const rect = e.currentTarget.getBoundingClientRect()
            const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            onVolumeChange(name, v)
          }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${volume * 100}%`,
              backgroundColor: muted ? '#48474a' : color,
              opacity: muted ? 0.4 : 1,
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-surface shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              left: `calc(${volume * 100}% - 6px)`,
              backgroundColor: muted ? '#48474a' : color,
            }}
          />
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={volume}
            disabled={muted}
            onChange={e => onVolumeChange(name, parseFloat(e.target.value))}
            aria-label={`${name} volume`}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
          />
        </div>

        <span className="text-[10px] font-label text-on-surface-variant w-8 text-right tabular-nums flex-shrink-0">
          {muted ? '–' : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  )
}
