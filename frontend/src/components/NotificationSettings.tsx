import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellIcon, CheckIcon } from 'lucide-react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { mapAsyncCatchError } from '@/lib/loadErrors'
import {
  getPushSubscription,
  isIosSafariNotInstalled,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushLocale,
} from '@/lib/push'
import { onPushMessage, type InPagePushPayload } from '@/lib/pushMessages'

type CardState =
  | 'loading'
  | 'ios-install' // iOS Safari, not installed: push can't work until Home-Screen install (constraint 6)
  | 'denied' // Notification permission blocked in browser settings
  | 'unavailable' // server has no VAPID keys provisioned
  | 'enabled'
  | 'disabled'

/**
 * The "Notifications" settings card (design #104 D5): explicit-tap enable
 * (permission prompt + PushManager subscribe, sending the current i18n
 * locale), enabled-state display, disable, and a test button. Hidden entirely
 * where web push cannot exist; soft-disabled with an install hint on
 * non-installed iOS Safari.
 */
export function NotificationSettings() {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<CardState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [received, setReceived] = useState<InPagePushPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    if (isIosSafariNotInstalled()) {
      setState('ios-install')
      return
    }
    if (!isPushSupported()) return // card renders nothing below
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    void getPushSubscription().then((sub) => {
      if (!cancelled) setState(sub ? 'enabled' : 'disabled')
    })
    return () => {
      cancelled = true
    }
  }, [])

  // A push arriving while this window is focused is forwarded by the SW as an
  // in-page message instead of a system notification (resolved decision 6d) —
  // surface it here so the test button demonstrates the full loop.
  useEffect(() => onPushMessage(setReceived), [])

  const locale: PushLocale = i18n.language?.startsWith('nb') ? 'nb' : 'en'

  const enable = async () => {
    setBusy(true)
    setError(null)
    setTestStatus(null)
    try {
      const result = await subscribeToPush(locale)
      if (result === 'subscribed') setState('enabled')
      else if (result === 'denied') setState('denied')
      else setState('unavailable')
    } catch (e) {
      setError(mapAsyncCatchError(e))
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setError(null)
    setTestStatus(null)
    setReceived(null)
    try {
      await unsubscribeFromPush()
      setState('disabled')
    } catch (e) {
      setError(mapAsyncCatchError(e))
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    setError(null)
    setTestStatus(null)
    setReceived(null)
    try {
      const report = await api.push.sendTest()
      setTestStatus(report.sent > 0 ? t('notifications.testSent') : t('notifications.testNone'))
    } catch (e) {
      setError(mapAsyncCatchError(e))
    } finally {
      setBusy(false)
    }
  }

  // Still resolving the subscription state — or a browser with no web push and
  // no install path to it (state never leaves 'loading'): render nothing.
  if (state === 'loading') return null

  return (
    <section
      className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground"
      aria-labelledby="notification-settings-title"
    >
      <div className="flex items-start gap-3">
        <BellIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 id="notification-settings-title" className="text-base font-semibold">
            {t('notifications.cardTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('notifications.description')}</p>
        </div>
      </div>

      {state === 'ios-install' && (
        <p className="text-sm text-muted-foreground">{t('notifications.iosInstallHint')}</p>
      )}
      {state === 'denied' && (
        <p className="text-sm text-muted-foreground">{t('notifications.permissionDenied')}</p>
      )}
      {state === 'unavailable' && (
        <p className="text-sm text-muted-foreground">{t('notifications.unavailable')}</p>
      )}

      {state === 'disabled' && (
        <Button className="h-11 rounded-full px-4" disabled={busy} onClick={() => void enable()}>
          {t('notifications.enable')}
        </Button>
      )}

      {state === 'enabled' && (
        <div className="space-y-3">
          {/* Green marks the done state, as everywhere else in the app. */}
          <p className="flex items-center gap-2 text-sm font-medium text-primary" role="status">
            <CheckIcon className="size-4 shrink-0" />
            {t('notifications.enabled')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-full px-4"
              disabled={busy}
              onClick={() => void sendTest()}
            >
              {t('notifications.test')}
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-full px-4"
              disabled={busy}
              onClick={() => void disable()}
            >
              {t('notifications.disable')}
            </Button>
          </div>
          {testStatus && <p className="text-sm text-muted-foreground">{testStatus}</p>}
          {received && (
            <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
              <p className="text-xs">{t('notifications.receivedInPage')}</p>
              <p className="mt-1 font-semibold">{received.title}</p>
              <p>{received.body}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
