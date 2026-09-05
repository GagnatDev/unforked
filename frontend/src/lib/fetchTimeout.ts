/**
 * Bounded fetch for flaky / hanging cellular links.
 *
 * A plain `fetch` with no AbortSignal can stall indefinitely when
 * `navigator.onLine` is still true (poor coverage, captive portals, half-open
 * TCP). That stalls auth bootstrap and background pulls, so the UI never leaves
 * its loading state. Every SPA request should go through {@link fetchWithTimeout}
 * so a stall becomes a reject the offline-first layer already knows how to handle.
 */

/** Default budget for same-origin API calls (auth + domain GETs/mutations). */
export const DEFAULT_FETCH_TIMEOUT_MS = 8_000

/** Slightly tighter budget for the auth bootstrap gate (blocks first paint). */
export const AUTH_FETCH_TIMEOUT_MS = 5_000

/**
 * Combine caller and timeout signals. Prefer `AbortSignal.any` when available;
 * otherwise abort when either signal fires.
 */
export function mergeAbortSignals(
  ...signals: (AbortSignal | undefined | null)[]
): AbortSignal | undefined {
  const active = signals.filter((s): s is AbortSignal => s != null)
  if (active.length === 0) return undefined
  if (active.length === 1) return active[0]
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(active)
  }
  const ac = new AbortController()
  const onAbort = () => {
    ac.abort()
    for (const s of active) {
      s.removeEventListener('abort', onAbort)
    }
  }
  for (const s of active) {
    if (s.aborted) {
      onAbort()
      break
    }
    s.addEventListener('abort', onAbort, { once: true })
  }
  return ac.signal
}

/**
 * `fetch` that rejects with a transport-level `TypeError('Failed to fetch')`
 * when the timeout elapses (so {@link mapAsyncCatchError} and auth catch paths
 * treat it like offline), while still propagating intentional caller aborts.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const timeout =
    typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : (() => {
          const ac = new AbortController()
          setTimeout(() => ac.abort(), timeoutMs)
          return ac.signal
        })()
  const callerSignal = init?.signal
  const signal = mergeAbortSignals(callerSignal, timeout)
  try {
    return await fetch(input, { ...init, signal })
  } catch (e) {
    const callerAborted = callerSignal?.aborted === true
    if (!callerAborted && timeout.aborted) {
      throw new TypeError('Failed to fetch')
    }
    throw e
  }
}
