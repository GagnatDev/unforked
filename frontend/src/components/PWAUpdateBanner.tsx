import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

type Props = {
  onUpdate: () => void
  onDismiss: () => void
}

export function PWAUpdateBanner({ onUpdate, onDismiss }: Props) {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-lg text-sm"
    >
      <span>{t('pwa.updateAvailable')}</span>
      <Button size="sm" onClick={onUpdate}>
        {t('pwa.reload')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        {t('pwa.dismiss')}
      </Button>
    </div>
  )
}
