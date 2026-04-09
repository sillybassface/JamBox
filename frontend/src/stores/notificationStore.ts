import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotifType = 'queued' | 'processing' | 'ready' | 'error'

export interface Notification {
  id: string
  type: NotifType
  title: string        // song title
  message: string      // human-readable status
  songId?: string
  taskId?: string
  timestamp: number    // Date.now()
  read: boolean
}

interface NotificationState {
  notifications: Notification[]
  push: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  /** Update an existing notification (matched by taskId or songId, optionally narrowed by type) */
  update: (match: { taskId?: string; songId?: string; type?: NotifType }, patch: Partial<Notification>) => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],

      push: (n) => set(s => ({
        notifications: [
          {
            ...n,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            read: false,
          },
          ...s.notifications,
        ].slice(0, 50), // cap at 50
      })),

      update: ({ taskId, songId, type }, patch) => set(s => ({
        notifications: s.notifications.map(n => {
          const match =
            ((taskId && n.taskId === taskId) ||
             (songId && n.songId === songId)) &&
            (type === undefined || n.type === type)
          return match ? { ...n, ...patch } : n
        }),
      })),

      markAllRead: () => set(s => ({
        notifications: s.notifications.map(n => ({ ...n, read: true })),
      })),

      dismiss: (id) => set(s => ({
        notifications: s.notifications.filter(n => n.id !== id),
      })),

      clearAll: () => set({ notifications: [] }),
    }),
    { name: 'jambox-notifications' }
  )
)
