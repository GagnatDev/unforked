import { type DependencyList, useEffect, useState } from 'react'

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: string }).name === 'AbortError'
  ) {
    return true
  }
  return false
}

export type UseAsyncOptions = {
  /** When false, the factory is not run and loading/error/data are cleared. */
  enabled?: boolean
  /**
   * When true, previous `data` is kept until the next request succeeds (no empty flash).
   * Use for refetch flows where the UI should stay populated while loading.
   */
  keepPreviousData?: boolean
}

export type UseAsyncResult<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Runs an async factory when dependencies change and cancels the previous run via
 * {@link AbortSignal}. Use this for page-level data loading instead of one-off
 * `useEffect` + `cancelled` flags.
 */
export function useAsync<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  options?: UseAsyncOptions,
): UseAsyncResult<T> {
  const enabled = options?.enabled ?? true
  const keepPreviousData = options?.keepPreviousData ?? false
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(() => enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    const ac = new AbortController()
    const { signal } = ac

    setLoading(true)
    setError(null)
    if (!keepPreviousData) {
      setData(null)
    }

    factory(signal)
      .then((value) => {
        if (signal.aborted) return
        setData(value)
      })
      .catch((e) => {
        if (signal.aborted || isAbortError(e)) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (signal.aborted) return
        setLoading(false)
      })

    return () => {
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps array is the contract
  }, [enabled, keepPreviousData, ...deps])

  return { data, loading, error }
}
