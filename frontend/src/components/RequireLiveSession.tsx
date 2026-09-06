import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { navigateForLogin } from '@/lib/session'
import { BackLink } from './BackLink'
import { Button } from './ui/button'

/** Only explicit server-owned settings use this gate; never domain routes. */
export function RequireLiveSession({ children }: { children: ReactNode }) {
  const { liveSession, accountMismatch, reauthPending, refreshUser } = useAuth()
  const { t } = useTranslation()
  const [checking, setChecking] = useState(false)
  if (liveSession) return <>{children}</>
  return <section className="space-y-4">
    <BackLink to="/profile" label={t('nav.profile')} />
    <p role="status">{t(accountMismatch ? 'auth.accountMismatch' : 'auth.needsConnection')}</p>
    <Button variant="outline" disabled={checking} onClick={() => {
      setChecking(true)
      void refreshUser().finally(() => setChecking(false))
    }}>{t('sync.now')}</Button>
    {(reauthPending || accountMismatch) && <Button variant="outline" onClick={() => void navigateForLogin()}>{t('auth.signIn')}</Button>}
  </section>
}
