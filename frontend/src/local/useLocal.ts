import { type DependencyList, useEffect, useState } from 'react'

import { type LocalStoreName, subscribeLocal } from './db'

export type UseLocalOptions = {
  /** When false, the query is not run and data/loading are cleared. */
  enabled?: boolean
}

export type UseLocalResult<T> = {
  /** `null` while loading, when disabled, or when the store has no answer yet. */
  data: T | null
  /** True until the first read for the current deps has resolved. */
  loading: boolean
}

/**
 * Reactive read from the local IndexedDB store (offline-first spec A2).
 * Runs `read` when `deps` change and again after every local write touching
 * one of `stores`, so views re-render on local writes without refetching.
 *
 * The network is not involved: pair with `useBackgroundPull` to populate the
 * store. `read` and `stores` are treated as stable per call site — only
 * `deps` (and `enabled`) retrigger the query.
 */
export function useLocal<T>(
  read: () => Promise<T | null>,
  stores: readonly LocalStoreName[],
  deps: DependencyList,
  options?: UseLocalOptions,
): UseLocalResult<T> {
  const enabled = options?.enabled ?? true
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(() => enabled)

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let generation = 0

    setLoading(true)
    setData(null)

    const run = () => {
      const started = ++generation
      read().then(
        (value) => {
          if (cancelled || started !== generation) return
          setData(value)
          setLoading(false)
        },
        (e) => {
          if (cancelled || started !== generation) return
          // Local reads should not take the page down; treat as "no data yet".
          console.error('useLocal read failed', e)
          setData(null)
          setLoading(false)
        },
      )
    }

    run()
    const unsubscribe = subscribeLocal(stores, run)
    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps array is the contract; read/stores are stable
  }, [enabled, ...deps])

  return { data, loading }
}
