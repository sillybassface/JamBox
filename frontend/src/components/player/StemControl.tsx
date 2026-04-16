import { StemState } from '../../hooks/useCustomAudioPlayer'

interface Props {
  stem: StemState
  onVolumeChange: (name: string, vol: number) => void
  onToggleMute: (name: string) => void
  onToggleSolo: (name: string) => void
}

export default function StemControl({ stem, onVolumeChange, onToggleMute, onToggleSolo }: Props) {
  const { name, volume, muted, soloed, peaks, color } = stem

  // Mini waveform preview (static from peaks)
  const previewPeaks = peaks.length > 0
    ? peaks.filter((_, i) => i % Math.ceil(peaks.length / 40) === 0).slice(0, 40)
    : Array.from({ length: 20 }, () => Math.random() * 0.8 + 0.1)

  const maxPeak = Math.max(...previewPeaks, 0.01)

  return (
    <div
      className={`bg-surface-container-low p-5 rounded-xl flex flex-col items-center gap-4 transition-colors ${
        soloed ? 'bg-surface-container ring-1 ring-primary/50' : ''
      } ${muted ? 'opacity-50' : ''}`}
    >
      {/* Name + controls */}
      <div className="w-full flex justify-between items-center">
        <span
          className="text-[10px] font-headline font-bold uppercase tracking-tighter"
          style={{ color }}
        >
          {name}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onToggleMute(name)}
            className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
              muted ? 'bg-error/30 text-error' : 'bg-surface-container-highest text-on-surface-variant hover:bg-error/20 hover:text-error'
            }`}
          >
            M
          </button>
          <button
            onClick={() => onToggleSolo(name)}
            className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
              soloed ? 'bg-primary/30 text-primary' : 'bg-surface-container-highest text-on-surface-variant hover:bg-yellow-500/20 hover:text-yellow-400'
            }`}
          >
            S
          </button>
        </div>
      </div>

      {/* Vertical fader */}
      <div className="flex-1 h-48 w-10 bg-surface-container-lowest rounded-full relative p-1 flex flex-col justify-end">
        <div
          className="w-full rounded-full relative transition-all"
          style={{
            height: `${volume * 100}%`,
            background: `linear-gradient(to top, ${color}40, ${color})`,
          }}
        >
          {/* Fader handle */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 backdrop-blur-md rounded-sm border shadow-lg flex items-center justify-center bg-surface-bright/80"
            style={{ borderColor: color }}
          >
            <div className="w-4 h-px" style={{ backgroundColor: color }} />
          </div>
        </div>
        {/* Invisible range input overlay */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(e) => onVolumeChange(name, parseFloat(e.target.value))}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', appearance: 'slider-vertical' } as any}
        />
      </div>

      {/* Mini waveform */}
      <div className="h-8 flex items-end gap-0.5 w-full overflow-hidden">
        {previewPeaks.map((p, i) => (
          <div
            key={i}
            className="flex-1 rounded-full min-w-[2px]"
            style={{
              height: `${Math.max(4, (p / maxPeak) * 100)}%`,
              backgroundColor: color,
              opacity: muted ? 0.3 : 0.7,
            }}
          />
        ))}
      </div>
    </div>
  )
}
