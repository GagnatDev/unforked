import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { listOutboxOps } from '@/local/db'
import { useLocal } from '@/local/useLocal'
import { getSyncStatus, subscribeSyncStatus } from '@/local/syncStatus'
import { syncNow } from '@/local/outboxSync'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from './ui/popover'
import { cn } from '@/lib/utils'

/** One quiet, inspectable reconciliation surface; local editing stays available. */
export function SyncStatus() {
  const { t } = useTranslation()
  const { reauthPending } = useAuth()
  const outcome = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const { data: ops, loading } = useLocal(listOutboxOps, ['outbox'], [])
  const [online, setOnline] = useState(navigator.onLine)
  const [requested, setRequested] = useState(false)
  const [requestFailed, setRequestFailed] = useState(false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const parked = ops?.filter(op => op.parkedAt != null).length ?? 0
  const cause = parked ? 'parked' : reauthPending ? 'auth' : outcome.failure ??
    (requestFailed || (!loading && ops == null) ? 'storage' : null)
  const state = !online ? 'offline' : outcome.active || requested ? 'syncing' : cause ? 'error' :
    loading || (ops?.length ?? 0) > 0 ? 'syncing' : 'synced'

  async function requestSync() {
    setRequested(true)
    setRequestFailed(false)
    try { await syncNow() } catch { setRequestFailed(true) }
    finally { setRequested(false) }
  }

  return (
    <Popover>
      <PopoverTrigger className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <span aria-hidden className={cn('size-2 rounded-full bg-muted-foreground',
          state === 'synced' && 'bg-primary', state === 'error' && 'bg-destructive')} />
        <span role="status">{t(`sync.${state}`)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-[calc(100vw-2rem)] gap-3 p-4">
        <PopoverTitle>{t(`sync.${state}`)}</PopoverTitle>
        <PopoverDescription>{t('sync.localSafe')}</PopoverDescription>
        <p className="tabular-nums">{t('sync.pending', { count: ops?.length ?? 0 })}</p>
        {!online ? <p>{t('sync.disconnected')}</p> : cause && <p>{t(`sync.cause.${cause}`)}</p>}
        <Button variant="outline" disabled={!online || outcome.active || requested} onClick={() => void requestSync()}>
          {t('sync.now')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
