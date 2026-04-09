import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, Notification, NotifType } from '../../stores/notificationStore'

const TYPE_ICON: Record<NotifType, string> = {
  queued:     'schedule',
  processing: 'sync',
  ready:      'check_circle',
  error:      'error',
}

const TYPE_COLOR: Record<NotifType, string> = {
  queued:     'text-on-surface-variant',
  processing: 'text-secondary',
  ready:      'text-tertiary',
  error:      'text-error',
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function NotifItem({ n, onDismiss, onNavigate }: {
  n: Notification
  onDismiss: (id: string) => void
  onNavigate: () => void
}) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-container-high/40 transition-colors group ${
        n.read ? '' : 'bg-primary/5'
      }`}
    >
      {/* Icon */}
      <span
        className={`material-symbols-outlined text-lg mt-0.5 flex-shrink-0 ${TYPE_COLOR[n.type]} ${
          n.type === 'processing' ? 'animate-spin' : ''
        }`}
        style={n.type === 'processing' ? { fontVariationSettings: "'FILL' 0" } : { fontVariationSettings: "'FILL' 1" }}
      >
        {TYPE_ICON[n.type]}
      </span>

      {/* Content */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onNavigate}
      >
        <p className="text-sm font-label font-bold text-on-surface truncate leading-tight">{n.title}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{n.message}</p>
        <p className="text-[10px] text-outline mt-1 font-label">{relativeTime(n.timestamp)}</p>
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(n.id) }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-outline hover:text-on-surface flex-shrink-0 mt-0.5"
        title="Dismiss"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  )
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { notifications, markAllRead, dismiss, clearAll } = useNotificationStore()
  const unread = notifications.filter(n => !n.read).length
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    setOpen(v => !v)
    if (!open && unread > 0) {
      // Mark all read after a short delay (so unread badge is visible on open)
      setTimeout(markAllRead, 600)
    }
  }

  const handleNavigate = (n: Notification) => {
    if (n.type === 'ready' && n.songId) {
      navigate(`/player/${n.songId}`)
    } else {
      navigate('/add', { state: { taskId: n.taskId, songId: n.songId } })
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative text-on-surface-variant hover:text-primary transition-colors"
        title="Notifications"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-primary text-on-primary-fixed text-[9px] font-bold rounded-full flex items-center justify-center font-label leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-container border border-white/10 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="font-headline font-bold text-xs uppercase tracking-widest text-on-surface">
              Notifications
            </span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] font-label text-outline hover:text-on-surface transition-colors uppercase tracking-widest"
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/30">notifications_none</span>
                <p className="text-xs text-on-surface-variant font-label">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onDismiss={dismiss}
                  onNavigate={() => handleNavigate(n)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
