import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { navigateForLogin } from '@/lib/session'

/**
 * Gate on the identity loaded from the backend. The auth sidecar normally
 * guarantees a session before the SPA is even served, so the unauthenticated
 * branch only shows when the session expired and the automatic reload guard
 * kicked in (see lib/session.ts).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, reloading } = useAuth()
  const { t } = useTranslation()

  if (loading) return <div className="p-6">{t('common.loading')}</div>

  // An expired session usually recovers on its own: a silent full page load
  // lets the sidecar re-authenticate. While that reload is in flight, show a
  // spinner rather than the manual screen — the button below would only flash
  // for a moment before the page reloads itself, which reads as a glitch.
  if (reloading) {
    return (
      <div
        className="flex flex-col items-center gap-3 pt-16 text-center text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <p className="text-sm">{t('auth.reloading')}</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">{t('auth.sessionExpired')}</p>
        {/*
          Must go through navigateForLogin, not window.location.reload(): a plain
          reload is answered by the PWA service worker from precache and never
          reaches the sidecar, so the login redirect can't run and the button
          re-renders in a loop. navigateForLogin unregisters the worker first.
        */}
        <Button onClick={() => void navigateForLogin()}>{t('auth.reload')}</Button>
      </div>
    )
  }
  return <>{children}</>
}
