import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'

const DISMISSED_KEY = 'pwa:install-dismissed'

type Props = {
  onInstall: () => void
}

export function PWAInstallBanner({ onInstall }: Props) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = usePersistedFlag(DISMISSED_KEY)

  if (dismissed) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/60 px-4 py-2 text-sm">
      <span className="flex-1">{t('pwa.installPrompt')}</span>
      <Button size="sm" onClick={onInstall}>
        {t('pwa.install')}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t('pwa.dismissInstall')}
        className="text-muted-foreground hover:text-foreground"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
