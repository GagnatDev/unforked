import { useTranslation } from 'react-i18next'
import { RefreshCwIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/**
 * Quiet "will sync when you sign back in" indicator (offline-first spec A7).
 *
 * Shows when the session was lost while unsynced work is still queued: rather
 * than reload the app mid-edit, re-auth is deferred to the next natural break
 * (see `lib/reauth.ts`). The user keeps editing against the local store; their
 * queued work is durable and drains once the session is valid again.
 */
export function PendingSyncIndicator({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { reauthPending } = useAuth()

  if (!reauthPending) return null

  return (
    <span
      role="status"
      aria-label={t('auth.willSync')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5',
        'text-xs font-medium text-sky-800',
        'dark:bg-sky-900/40 dark:text-sky-300',
        className
      )}
    >
      <RefreshCwIcon className="h-3 w-3" aria-hidden />
      {t('auth.willSync')}
    </span>
  )
}
