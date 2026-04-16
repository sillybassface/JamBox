import { useLayoutEffect, useRef, useState } from 'react'
import { Measure } from '../../api/client'
import { chordToDegree } from '../../lib/musicTheory'

interface Props {
  measures: Measure[]
  timeSig: number
  currentTime: number
  songKey: string
  showDegree: boolean
}

function timeToPixel(time: number, measures: Measure[], measurePx: number): number {
  if (!measures.length) return 0
  if (time < measures[0].start) return 0
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i]
    if (time >= m.start && time < m.end) {
      return i * measurePx + ((time - m.start) / (m.end - m.start)) * measurePx
    }
  }
  return measures.length * measurePx
}

export default function ChordChartGrid({ measures, timeSig, currentTime, songKey, showDegree }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ~5 measures visible; playhead anchored at centre once reached
  const measurePx = containerWidth > 0 ? Math.floor(containerWidth / 5) : 100
  const cursorX = containerWidth / 2
  const currentPx = timeToPixel(currentTime, measures, measurePx)

  // Phase 1 — playhead moves left→centre while content stays still
  // Phase 2 — playhead fixed at centre, content scrolls left
  const isScrolling = currentPx >= cursorX
  const playheadX = isScrolling ? cursorX : currentPx
  const translateX = isScrolling ? cursorX - currentPx : 0

  // Active measure for chord-label colour
  const activeMeasureIdx = (() => {
    if (!measures.length) return -1
    let lo = 0, hi = measures.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (currentTime < measures[mid].start) hi = mid - 1
      else if (currentTime >= measures[mid].end) lo = mid + 1
      else return mid
    }
    return -1
  })()

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg"
      style={{ height: 72 }}
    >
      {containerWidth > 0 && (
        <>
          {/* ── Scrolling measure strip ──────────────────────────────── */}
          <div
            className="absolute top-0 h-full flex"
            style={{ transform: `translateX(${translateX}px)`, willChange: 'transform' }}
          >
            {measures.map((m, i) => {
              const isActive = m.index === activeMeasureIdx
              const measureCenterPx = i * measurePx + measurePx / 2
              const distInMeasures = Math.abs(measureCenterPx - currentPx) / measurePx
              const opacity = Math.max(0.07, Math.pow(0.52, distInMeasures))

              return (
                <div
                  key={m.index}
                  className="relative h-full flex-shrink-0"
                  style={{ width: measurePx, opacity }}
                >
                  {/* Beat indicator lines ── beat 1 tall+bright, beats 2-4 short+dim */}
                  {Array.from({ length: timeSig }).map((_, b) => {
                    const isBeat1 = b === 0
                    // No beat-1 line on the very first measure (nothing to the left)
                    if (isBeat1 && i === 0) return null
                    return (
                      <div
                        key={b}
                        className="absolute w-px"
                        style={{
                          left: `${(b / timeSig) * 100}%`,
                          top: isBeat1 ? 6 : '35%',
                          bottom: isBeat1 ? 6 : '35%',
                          background: isBeat1
                            ? 'rgba(255,255,255,0.25)'
                            : 'rgba(255,255,255,0.08)',
                        }}
                      />
                    )
                  })}

                  {/* Measure number */}
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-mono text-white/20 select-none leading-none">
                    {m.index + 1}
                  </span>

                  {/* Chord labels at beat-fraction positions */}
                  {m.chords.map(entry => {
                    const isN = entry.chord === 'N'
                    const label = showDegree ? chordToDegree(entry.chord, songKey) : entry.chord
                    return (
                      <div
                        key={entry.beat}
                        className={[
                          'absolute inset-y-0 flex items-center pl-2 select-none',
                          'text-base font-black font-mono leading-none',
                          isActive ? 'text-primary' : 'text-on-surface/88',
                        ].join(' ')}
                        style={{ left: `${((entry.beat - 1) / timeSig) * 100}%` }}
                      >
                        {isN ? <span className="opacity-25">·</span> : label}
                      </div>
                    )
                  })}

                  {/* Beat dots at bottom — beat 1 larger + brighter */}
                  {Array.from({ length: timeSig }).map((_, b) => (
                    <div
                      key={b}
                      className="absolute"
                      style={{
                        bottom: 7,
                        left: `${(b / timeSig) * 100}%`,
                        // beat 1: nudge slightly right of the boundary line
                        // beats 2-4: centre on their position
                        transform: b === 0 ? 'translateX(3px)' : 'translateX(-50%)',
                      }}
                    >
                      <div
                        style={{
                          width: b === 0 ? 4 : 3,
                          height: b === 0 ? 4 : 3,
                          borderRadius: '50%',
                          background: b === 0
                            ? 'rgba(255,255,255,0.30)'
                            : 'rgba(255,255,255,0.10)',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* ── Left edge fade — only once carousel is scrolling ─────── */}
          {isScrolling && (
            <div
              className="absolute left-0 top-0 h-full w-24 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to right, var(--surface) 15%, transparent)' }}
            />
          )}

          {/* ── Right edge fade — always visible ─────────────────────── */}
          <div
            className="absolute right-0 top-0 h-full w-24 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, var(--surface) 15%, transparent)' }}
          />

          {/* ── Glowing playhead ─────────────────────────────────────── */}
          {/* Outer halo */}
          <div
            className="absolute top-0 h-full z-20 pointer-events-none"
            style={{
              left: playheadX - 8,
              width: 16,
              background: 'color-mix(in srgb, var(--primary) 18%, transparent)',
              filter: 'blur(5px)',
            }}
          />
          {/* Sharp centre line */}
          <div
            className="absolute top-0 h-full z-20 pointer-events-none"
            style={{
              left: playheadX - 1,
              width: 2,
              background: 'var(--primary)',
              boxShadow: '0 0 6px 2px var(--primary), 0 0 16px 5px color-mix(in srgb, var(--primary) 40%, transparent)',
            }}
          />
        </>
      )}
    </div>
  )
}
