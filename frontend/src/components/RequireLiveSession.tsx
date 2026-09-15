import { useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { navigateForLogin } from '@/lib/session'
import { SettingsUnavailable } from './SettingsUnavailable'

/** Only explicit server-owned settings use this gate; never domain routes. */
export function RequireLiveSession({ children, titleKey, embedded = false }: { children: ReactNode; titleKey?: string; embedded?: boolean }) {
  const { liveSession, accountMismatch, reauthPending, refreshUser, availabilityFailure, checkingSession } = useAuth()
  const [checking, setChecking] = useState(false)
  if (liveSession) return <>{children}</>
  return <SettingsUnavailable titleKey={titleKey} embedded={embedded}
    reason={accountMismatch ? 'mismatch' : reauthPending ? 'reauth' : availabilityFailure ?? 'connection'}
    busy={checking || checkingSession}
    onRetry={() => {
      setChecking(true)
      void refreshUser().finally(() => setChecking(false))
    }}
    onSignIn={reauthPending || accountMismatch ? () => void navigateForLogin() : undefined}
  />
}
