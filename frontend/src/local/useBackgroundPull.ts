import { type DependencyList, useEffect, useState } from 'react'

import { mapAsyncCatchError } from '@/lib/loadErrors'

export type UseBackgroundPullResult = {
  /** True while the pull started by the current deps is still in flight. */
  pulling: boolean
  /** Error of the most recent pull, mapped for display; null while pulling. */
  error: string | null
}

/**
 * Kicks a network pull (which writes into the local store) when `deps`
 * change. The UI never awaits it — reads come from `useLocal`; a pull error
 * only matters when there is no local data to show, which the caller decides.
 *
 * The pull is not aborted on deps change or unmount: its store writes stay
 * valid background input regardless of which view is mounted.
 */
export function useBackgroundPull(
  pull: () => Promise<void>,
  deps: DependencyList,
  options?: { enabled?: boolean },
): UseBackgroundPullResult {
  const enabled = options?.enabled ?? true
  const [pulling, setPulling] = useState(() => enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setPulling(false)
      setError(null)
      return
    }

    let stale = false
    setPulling(true)
    setError(null)
    pull().then(
      () => {
        if (!stale) setPulling(false)
      },
      (e) => {
        if (stale) return
        setError(mapAsyncCatchError(e))
        setPulling(false)
      },
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps array is the contract; pull is stable
  }, [enabled, ...deps])

  return { pulling, error }
}
