import { fetchWithTimeout, mergeAbortSignals } from './fetchTimeout'

/** Cached identity permits local work only; reconciliation requires live proof. */
export type LocalSessionState = 'checking' | 'live' | 'reauth' | 'unavailable' | 'mismatch' | 'logged-out'
let state: LocalSessionState = 'checking'
let epoch = 0
let controller = new AbortController()
const listeners = new Set<() => void>()
let verifier: (() => Promise<void>) | undefined

export const getLocalSessionState = () => state
export const getSessionEpoch = () => epoch
export const subscribeLocalSession = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function setLocalSessionState(next: LocalSessionState): void {
  if (next === state) return
  state = next
  epoch++
  controller.abort()
  controller = new AbortController()
  listeners.forEach(listener => listener())
}
export function registerSessionVerifier(next: () => Promise<void>): () => void {
  verifier = next
  return () => { if (verifier === next) verifier = undefined }
}
export async function ensureLiveSession(recover = false): Promise<boolean> {
  try {
    const { trackSync } = await import('@/local/syncStatus')
    await trackSync('auth', async () => {
      if (state !== 'live' && (recover || state === 'checking')) await verifier?.()
      if (state === 'unavailable') throw new TypeError('Failed to fetch')
      assertLiveSession()
    })
    return true
  } catch { return false }
}
export function assertLiveSession(expectedEpoch = epoch): void {
  if (state !== 'live' || epoch !== expectedEpoch) {
    throw Object.assign(new Error('Sync needs a matching live session'), { status: 401 })
  }
}
export function sessionGuard(): () => void {
  const expected = epoch
  assertLiveSession(expected)
  return () => assertLiveSession(expected)
}

/** Abort on known boundary changes; never treat cancellation as server rollback. */
export async function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const check = sessionGuard()
  const res = await fetchWithTimeout(input, {
    ...init, signal: mergeAbortSignals(init?.signal, controller.signal), redirect: 'manual',
  })
  check()
  if (res.status === 401 || res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    setLocalSessionState('reauth')
    const { requestReauth } = await import('./reauth')
    await requestReauth()
    throw Object.assign(new Error('Session expired'), { status: 401 })
  }
  return res
}

/** Explicit setup for domain-only tests that do not mount AuthProvider. */
export function __resetLocalSessionForTests(next: LocalSessionState = 'checking'): void {
  verifier = undefined
  setLocalSessionState(next)
}
