import { UserMenu } from '@/components/UserMenu'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import { PendingSyncIndicator } from '@/components/PendingSyncIndicator'

type TopBarProps = {
  onLogout: () => void
}

/**
 * Slim bar carrying the wordmark and the things that must be true everywhere:
 * whether we are offline, whether writes are still queued, and the menu.
 * Navigation itself lives in {@link BottomNav}, under the thumb.
 */
export function TopBar({ onLogout }: TopBarProps) {
  return (
    <header className="mb-5 flex h-11 items-center gap-2">
      <span className="text-base font-semibold tracking-tight lowercase">unforked</span>
      <div className="ml-auto flex items-center gap-2">
        <PendingSyncIndicator />
        <OfflineIndicator />
        <UserMenu onLogout={onLogout} />
      </div>
    </header>
  )
}
