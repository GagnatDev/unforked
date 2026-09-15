import { useTranslation } from 'react-i18next'
import { BackLink } from './BackLink'
import { Button } from './ui/button'

export type SettingsFailure = 'connection' | 'permission' | 'server' | 'reauth' | 'mismatch'

/** A server-owned surface can fail without taking the local workspace with it. */
export function SettingsUnavailable({ titleKey, reason = 'connection', busy = false, onRetry, onSignIn, embedded = false }: {
  titleKey?: string
  reason?: SettingsFailure
  busy?: boolean
  onRetry: () => void
  onSignIn?: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  return <section className="space-y-4" aria-busy={busy}>
    {!embedded && <header>
      <BackLink to="/profile" label={t('nav.profile')} />
      {titleKey && <h1 className="mt-1 mb-0">{t(titleKey)}</h1>}
    </header>}
    <div className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground">
      {embedded && titleKey && <h2 className="text-base font-semibold">{t(titleKey)}</h2>}
      <div role="status">
        <h2 className="text-base font-semibold">{t(busy ? 'settings.loading' : `settings.${reason}Title`)}</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{t(busy ? 'settings.loadingBody' : `settings.${reason}Body`)}</p>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{t('settings.localAvailable')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11 rounded-full px-4" disabled={busy} onClick={onRetry}>{t(busy ? 'settings.loading' : 'settings.retry')}</Button>
        {onSignIn && <Button variant="outline" className="min-h-11 rounded-full px-4" disabled={busy} onClick={onSignIn}>{t('auth.signIn')}</Button>}
      </div>
    </div>
  </section>
}
