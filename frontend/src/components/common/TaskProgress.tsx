import { useEffect, useState } from 'react'
import { useTaskWebSocket } from '../../hooks/useTaskPolling'

interface Props {
  taskId: string
  onComplete?: () => void
  onError?: (err: string) => void
}

const STEPS = [
  { key: 'starting', label: 'Preparing…' },
  { key: 'downloading', label: 'Downloading audio' },
  { key: 'separating', label: 'Separating stems (AI)' },
  { key: 'waveform', label: 'Generating waveforms' },
  { key: 'chords', label: 'Analyzing beats and chords' },
]

export default function TaskProgress({ taskId, onComplete, onError }: Props) {
  const event = useTaskWebSocket(taskId)
  const [status, setStatus] = useState<string>('queued')
  const [currentStep, setCurrentStep] = useState<string>('starting')
  const [progress, setProgress] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<string[]>([])

  useEffect(() => {
    if (!event) return
    setStatus(event.status)
    if (event.step) {
      const prevStep = currentStep
      setCurrentStep(event.step)
      if (prevStep && prevStep !== event.step && STEPS.some(s => s.key === prevStep)) {
        setCompletedSteps(prev => [...prev, prevStep])
      }
    }
    if (event.progress !== undefined) setProgress(event.progress)
    if (event.status === 'completed') onComplete?.()
    if (event.status === 'failed') onError?.(event.error ?? 'Unknown error')
  }, [event])

  const pct = Math.round(progress * 100)

  return (
    <div className="w-full space-y-3">
      {/* Master progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-secondary to-primary rounded-full transition-all duration-500 relative"
            style={{ width: `${pct}%` }}
          >
            {status === 'running' && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}
          </div>
        </div>
        <span className="text-xs font-label text-tertiary min-w-[3ch]">{pct}%</span>
      </div>

      {/* Completed steps */}
      {completedSteps.map(stepKey => {
        const step = STEPS.find(s => s.key === stepKey)
        return (
          <div key={stepKey} className="flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-tertiary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <span className="font-label text-on-surface-variant">{step?.label}</span>
            <span className="text-xs font-label text-tertiary ml-auto">completed</span>
          </div>
        )
      })}

      {/* Current step */}
      {status === 'running' && currentStep && (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-lg animate-spin">progress_activity</span>
          <span className="text-sm font-label text-on-surface">
            {STEPS.find(s => s.key === currentStep)?.label ?? currentStep}
          </span>
        </div>
      )}

      {status === 'failed' && (
        <p className="text-xs text-error font-label flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">error</span>
          Processing failed
        </p>
      )}
    </div>
  )
}
