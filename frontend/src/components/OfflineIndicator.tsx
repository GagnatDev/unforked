import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOffIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OfflineIndicator({ className }: { className?: string }) {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <span
      role="status"
      aria-label={t('pwa.offline')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5',
        'text-xs font-medium text-amber-800',
        'dark:bg-amber-900/40 dark:text-amber-300',
        className
      )}
    >
      <WifiOffIcon className="h-3 w-3" aria-hidden />
      {t('pwa.offline')}
    </span>
  )
}
