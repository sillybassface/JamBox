import { useState, useEffect, useCallback, useRef } from 'react'

const EQ_BANDS = [
  { freq: 32, label: '32' },
  { freq: 64, label: '64' },
  { freq: 125, label: '125' },
  { freq: 250, label: '250' },
  { freq: 500, label: '500' },
  { freq: 1000, label: '1k' },
  { freq: 2000, label: '2k' },
  { freq: 4000, label: '4k' },
  { freq: 8000, label: '8k' },
  { freq: 16000, label: '16k' },
]

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Vocal: [-2, -1, 0, 2, 4, 3, 1, 0, -1, -2],
  'Pop/Rock': [4, 3, 0, -1, -2, 0, 2, 3, 4, 3],
  'Bass Boost': [6, 5, 3, 0, -2, -2, 0, 2, 4, 5],
}

function EqBand({ label, value, onChange }: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    
    const updateValue = (clientY: number) => {
      if (!barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const deltaY = clientY - midY
      const newValue = Math.round(-deltaY / (rect.height / 2) * 12)
      onChange(Math.max(-12, Math.min(12, newValue)))
    }
    
    updateValue(e.clientY)
    
    const handleMouseMove = (e: MouseEvent) => updateValue(e.clientY)
    const handleMouseUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }
  
  const pct = ((value + 12) / 24) * 100
  const isBoosted = value > 0
  const isCut = value < 0
  
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[10px] font-mono tabular-nums h-4 w-8 text-center" style={{ color: value !== 0 ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
        {value > 0 ? `+${value}` : value < 0 ? `${value}` : '0'}
      </span>
      
      <div 
        ref={barRef}
        onMouseDown={handleMouseDown}
        className="relative h-24 w-4 cursor-pointer select-none"
      >
        {/* Full range background track */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-white/5 rounded-full" />
        {/* Center line */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
        
        {/* Active gain indicator */}
        {value !== 0 && (
          <div 
            className="absolute left-1/2 -translate-x-1/2 w-1.5 rounded-full transition-all"
            style={{
              height: `${(Math.abs(value) / 12) * 50}%`,
              background: 'var(--primary)',
              bottom: isBoosted ? '50%' : 'auto',
              top: isCut ? '50%' : 'auto',
              opacity: 0.7,
              boxShadow: `0 0 8px var(--primary)`,
            }}
          />
        )}
        
        {/* White knob */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg transition-all z-10"
          style={{ top: `calc(${100 - pct}% - 6px)` }}
        />
      </div>
      
      <span className="text-[9px] font-mono text-on-surface-variant/50">{label}</span>
    </div>
  )
}

export default function Equalizer({ onEqChange, onUserChange, initialGains }: { onEqChange?: (gains: number[], isExternal: boolean) => void; onUserChange?: () => void; initialGains?: number[] }) {
  const [gains, setGains] = useState<number[]>(() => initialGains || new Array(10).fill(0))
  const prevInitialGains = useRef<string>(JSON.stringify(initialGains || []))
  const isExternalUpdate = useRef(false)

  // Sync with initialGains only when it changes (from preset selection)
  useEffect(() => {
    // Don't sync when initialGains is undefined (Custom mode - manage own state)
    if (!initialGains) return
    
    const newKey = JSON.stringify(initialGains)
    if (prevInitialGains.current !== newKey) {
      prevInitialGains.current = newKey
      isExternalUpdate.current = true
      setGains(initialGains)
      setTimeout(() => {
        isExternalUpdate.current = false
      }, 0)
    }
  }, [initialGains])

  const handleChange = useCallback((idx: number, value: number) => {
    setGains(prev => {
      const next = [...prev]
      next[idx] = Math.max(-12, Math.min(12, value))
      return next
    })
    onUserChange?.()
  }, [onUserChange])

  useEffect(() => {
    // Pass isExternal flag to prevent preset -> Custom loop
    onEqChange?.(gains, isExternalUpdate.current)
  }, [gains, onEqChange])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-1">
        {EQ_BANDS.map((band, idx) => (
          <EqBand 
            key={band.freq}
            label={band.label}
            value={gains[idx]}
            onChange={(v) => handleChange(idx, v)}
          />
        ))}
      </div>
    </div>
  )
}