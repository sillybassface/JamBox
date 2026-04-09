interface Props {
  status: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-surface-container-highest text-on-surface-variant' },
  downloading: { label: 'Downloading', className: 'bg-secondary/20 text-secondary' },
  separating: { label: 'Separating', className: 'bg-primary/20 text-primary' },
  converting: { label: 'Converting', className: 'bg-tertiary/20 text-tertiary' },
  waveform: { label: 'Processing', className: 'bg-primary/20 text-primary' },
  ready: { label: 'Ready', className: 'bg-tertiary/20 text-tertiary' },
  error: { label: 'Error', className: 'bg-error/20 text-error' },
}

export default function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-surface-container-highest text-on-surface-variant' }
  const isProcessing = ['downloading', 'separating', 'converting', 'waveform'].includes(status)

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full font-label ${cfg.className}`}>
      {isProcessing && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {cfg.label}
    </span>
  )
}
