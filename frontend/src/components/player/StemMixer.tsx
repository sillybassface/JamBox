import StemControl from './StemControl'
import { StemState } from '../../hooks/useMultiStemPlayer'

interface Props {
  stemStates: Map<string, StemState>
  onVolumeChange: (name: string, vol: number) => void
  onToggleMute: (name: string) => void
  onToggleSolo: (name: string) => void
  onReset?: () => void
}

export default function StemMixer({ stemStates, onVolumeChange, onToggleMute, onToggleSolo, onReset }: Props) {
  const stems = [...stemStates.values()]

  return (
    <section className="w-full">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-headline font-bold tracking-tight text-on-surface">STEM MIXER</h2>
          <p className="text-outline text-sm font-label mt-0.5">Isolate and balance individual track components</p>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-lg bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-on-surface font-label text-xs uppercase tracking-widest transition-all"
          >
            Reset All
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {stems.map((stem) => (
          <StemControl
            key={stem.name}
            stem={stem}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
            onToggleSolo={onToggleSolo}
          />
        ))}
      </div>
    </section>
  )
}
