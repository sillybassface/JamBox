import { useEffect, useRef, useState } from 'react'
import { Task } from '../api/client'

type ProgressEvent = {
  task_id: string
  status: string
  step?: string
  progress?: number
  message?: string
  error?: string
}

export function useTaskWebSocket(
  taskId: string | null,
  onEvent?: (event: ProgressEvent) => void,
) {
  const [event, setEvent] = useState<ProgressEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  // Keep onEvent in a ref so changing it doesn't re-open the socket
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  useEffect(() => {
    if (!taskId) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/tasks/${taskId}/ws`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type !== 'ping') {
          setEvent(data)
          onEventRef.current?.(data)
        }
      } catch (e) {
        console.warn('Failed to parse WebSocket message:', e)
      }
    }

    ws.onerror = () => {
      console.warn('WebSocket error for task', taskId)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [taskId])

  return event
}

export function useTaskPolling(taskId: string | null, intervalMs = 2000) {
  const [task, setTask] = useState<Task | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!taskId) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' })
        if (res.ok) {
          const t: Task = await res.json()
          setTask(t)
          if (t.status === 'completed' || t.status === 'failed') {
            if (intervalRef.current) clearInterval(intervalRef.current)
          }
        }
      } catch (e) {
        console.warn('Failed to poll task:', e)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, intervalMs)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [taskId, intervalMs])

  return task
}
