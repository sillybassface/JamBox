import { useState } from 'react'
import { ChordData, Measure } from '../../api/client'

interface Props {
  chordData: ChordData | null
  currentTime: number
}

export default function Beats({ chordData, currentTime }: Props) {
  const [isOpen, setIsOpen] = useState(true)

  const measures = chordData?.measures ?? []

  // Binary search: find the measure that contains currentTime
  let activeMeasureIdx = -1
  let activeMeasure: Measure | null = null
  if (measures.length > 0) {
    let lo = 0, hi = measures.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (currentTime < measures[mid].start) hi = mid - 1
      else if (currentTime >= measures[mid].end) lo = mid + 1
      else { activeMeasureIdx = mid; activeMeasure = measures[mid]; break }
    }
  }

  // Resolve active section → time sig
  const activeSectionIdx = activeMeasure?.section_index ?? 0
  const activeSection = chordData?.sections?.[activeSectionIdx] ?? chordData?.sections?.[0]
  const timeSig = activeSection?.time_sig ?? { num: 4, den: 4 }
  const timeSigNum = timeSig.num
  const timeSigDen = timeSig.den

  // Beat index within the measure (0-indexed)
  let activeBeat = -1
  if (activeMeasure) {
    const dur = activeMeasure.end - activeMeasure.start
    if (dur > 0) {
      activeBeat = Math.min(
        Math.floor(((currentTime - activeMeasure.start) / dur) * timeSigNum),
        timeSigNum - 1,
      )
    }
  }

  return (
    <div className="border-b border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3">
        <button
          onClick={e => { e.stopPropagation(); setIsOpen(o => !o) }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer"
        >
          <span
            className="material-symbols-outlined text-sm transition-transform"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            chevron_right
          </span>
          <span className="font-headline font-bold text-xs uppercase tracking-widest text-primary">
            Beats
          </span>
        </button>

        {chordData && isOpen && (
          <span className="text-[10px] font-label text-on-surface-variant/70 tabular-nums px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
            {Math.round(chordData.global_tempo)} BPM
            {chordData.tempo_stability === "variable" && " (var)"}
            {chordData.tempo_stability === "moderate" && " (mod)"} · {timeSigNum}/{timeSigDen}
            {activeMeasureIdx >= 0 && ` · m.${activeMeasureIdx + 1}`}
          </span>
        )}
      </div>

      {/* Beat pads */}
      {isOpen && (
        <div className="px-6 pb-4">
          {!chordData ? (
            <div className="h-11 flex items-center justify-center text-on-surface-variant/40 text-xs">
              Awaiting analysis…
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              {Array.from({ length: timeSigNum }).map((_, i) => {
                const isActive = i === activeBeat
                const isDownbeat = i === 0
                return (
                  <div
                    key={i}
                    className="flex-1 flex items-center justify-center rounded-lg font-mono font-bold select-none transition-all duration-75"
                    style={{
                      height: isDownbeat ? 44 : 36,
                      fontSize: isDownbeat ? 14 : 12,
                      background: isActive
                        ? 'var(--primary)'
                        : 'rgba(255,255,255,0.05)',
                      color: isActive
                        ? 'var(--on-primary, #000)'
                        : 'rgba(255,255,255,0.25)',
                      boxShadow: isActive
                        ? '0 0 14px 5px color-mix(in srgb, var(--primary) 35%, transparent)'
                        : 'none',
                      transform: isActive ? 'scaleY(1.1)' : 'scaleY(1)',
                    }}
                  >
                    {i + 1}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
