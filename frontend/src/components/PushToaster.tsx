import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { onPushMessage, type InPagePushPayload } from '@/lib/pushMessages'

const AUTO_DISMISS_MS = 8000

type Toast = { id: number; payload: InPagePushPayload }

/**
 * In-page surface for push notifications that arrive while a window of the
 * app is focused: the service worker suppresses the system notification
 * (design #104, resolved decision 6d) and forwards the payload here instead.
 * Strings are server-composed and final — this just shows them. Tapping a
 * toast follows the payload's deep link (an in-app path) like a notification
 * click would; toasts auto-dismiss after a few seconds.
 */
export function PushToaster() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>()
    const unsubscribe = onPushMessage((payload) => {
      const id = nextId.current++
      // Same coalescing contract as system notifications: a new push with the
      // same tag replaces the one it supersedes.
      setToasts((current) => [
        ...current.filter((toast) => !payload.tag || toast.payload.tag !== payload.tag),
        { id, payload },
      ])
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id)
          dismiss(id)
        }, AUTO_DISMISS_MS)
      )
    })
    return () => {
      unsubscribe()
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map(({ id, payload }) => (
        <div
          key={id}
          className="flex items-start gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-lg"
        >
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => {
              dismiss(id)
              navigate(payload.url)
            }}
          >
            <span className="block font-medium">{payload.title}</span>
            <span className="block whitespace-pre-line text-muted-foreground">{payload.body}</span>
          </button>
          <button
            type="button"
            aria-label={t('notifications.dismiss')}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => dismiss(id)}
          >
            <XIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
