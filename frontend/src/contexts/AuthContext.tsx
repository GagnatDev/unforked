import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { clearCachedIdentity, readCachedIdentity, writeCachedIdentity } from '@/lib/authIdentity'
import { AUTH_FETCH_TIMEOUT_MS, fetchWithTimeout } from '@/lib/fetchTimeout'
import { markAuthenticated, navigateForLogin, onSessionLost } from '@/lib/session'
import { clearDeferredReauth, isReauthDeferred, onReauthStateChange, requestReauth, setSessionEstablished } from '@/lib/reauth'
import { getLocalSessionState, getSessionEpoch, registerSessionVerifier, setLocalSessionState, subscribeLocalSession } from '@/lib/localSession'
import { bindLocalOwner, rebindLocalOwnerFamily, sameLocalOwner, getSyncMeta, setSyncMeta } from '@/local/db'
import { canUseCrossTab, postCrossTab, subscribeCrossTab } from '@/local/crossTab'
import { scheduleCatchUp } from '@/local/outboxSync'
import { setLiveEventsUser } from '@/local/liveEvents'

export type UserInfo = { id: string; email: string; role: string; familyId: string }
type AuthContextValue = {
  user: UserInfo | null
  loading: boolean
  reloading: boolean
  checkingSession?: boolean
  reauthPending: boolean
  liveSession: boolean
  accountMismatch: boolean
  availabilityFailure?: 'connection' | 'permission' | 'server'
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  /** Re-bind this workspace after the server moved the user into `familyId`. */
  joinFamily: (familyId: string) => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)
const base = import.meta.env.VITE_API_URL ?? ''
const BOUNDARY_KEY = 'auth:boundary'
function announceBoundary(kind: 'logout' | 'mismatch') {
  const nonce = crypto.randomUUID()
  postCrossTab({ kind: 'auth-boundary', boundary: kind, nonce })
  try { localStorage.setItem(BOUNDARY_KEY, JSON.stringify({ kind, nonce })) } catch { /* BroadcastChannel is independent of storage quota. */ }
}
function canCoordinateBoundaries(): boolean {
  if (canUseCrossTab()) return true
  try {
    localStorage.setItem('auth:coordination-probe', '1')
    localStorage.removeItem('auth:coordination-probe')
    return true
  } catch { return false }
}

/** The local identity is a workspace key, never proof of server authorization. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const cached = useRef(readCachedIdentity())
  const current = useRef<UserInfo | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [availabilityFailure, setAvailabilityFailure] = useState<'connection' | 'permission' | 'server'>('connection')
  const [reloading, setReloading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [reauthPending, setReauthPending] = useState(isReauthDeferred)
  const session = useSyncExternalStore(subscribeLocalSession, getLocalSessionState)
  const generation = useRef(0)
  const revoked = useRef(false)
  const bootstrap = useRef<Promise<void> | null>(null)
  const checking = useRef<Promise<void> | null>(null)

  const publishUser = useCallback((next: UserInfo | null) => {
    current.current = next
    setUser(next)
    setSessionEstablished(next !== null)
  }, [])

  const initialize = useCallback(() => {
    if (!bootstrap.current) bootstrap.current = (async () => {
      if (!cached.current) return
      const version = generation.current
      if (await getSyncMeta<boolean>('auth:loggedOut')) return
      const matches = await bindLocalOwner(cached.current, true)
      if (version !== generation.current) return
      if (matches) publishUser(cached.current)
      else setLocalSessionState('mismatch')
      setLoading(false)
    })()
    return bootstrap.current
  }, [publishUser])

  const loadUser = useCallback((): Promise<void> => {
    if (revoked.current) return Promise.resolve()
    if (checking.current) return checking.current
    const version = generation.current
    setCheckingSession(true)
    const pending = (async () => {
      try {
        await initialize()
        if (version !== generation.current) return
        // Unique search bypasses auth bodies stored by older NetworkFirst SWs.
        // Workbox's old rule did not set ignoreSearch. Never accept HTTP cache
        // or cached display identity as live proof.
        const proofEpoch = getSessionEpoch()
        const res = await fetchWithTimeout(`${base}/api/auth/me?probe=${crypto.randomUUID()}`, {
          cache: 'no-store', redirect: 'manual',
        }, AUTH_FETCH_TIMEOUT_MS)
        if (version !== generation.current || proofEpoch !== getSessionEpoch()) return
        if (res.ok) {
          const next = await res.json() as UserInfo
          if (version !== generation.current || proofEpoch !== getSessionEpoch()) return
          if (!next || typeof next.id !== 'string' || typeof next.familyId !== 'string' || typeof next.email !== 'string' || typeof next.role !== 'string') throw new Error('Invalid identity')
          const matches = (!current.current || sameLocalOwner(current.current, next)) && await bindLocalOwner(next)
          if (version !== generation.current || proofEpoch !== getSessionEpoch()) return
          if (!matches) {
            setLocalSessionState('mismatch')
            announceBoundary('mismatch')
            return
          }
          await setSyncMeta('auth:loggedOut', false, () => {
            if (version !== generation.current || proofEpoch !== getSessionEpoch()) throw new Error('Stale identity proof')
          })
          if (version !== generation.current || proofEpoch !== getSessionEpoch()) return
          writeCachedIdentity(next)
          publishUser(next)
          markAuthenticated()
          clearDeferredReauth()
          setReloading(false)
          const recovered = getLocalSessionState() !== 'live'
          setLocalSessionState(canCoordinateBoundaries() ? 'live' : 'unavailable')
          if (recovered) scheduleCatchUp()
        } else if (res.status === 401 || res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
          setLocalSessionState('reauth')
          const disposition = await requestReauth()
          if (version === generation.current && !current.current) setReloading(disposition === 'reloading')
        } else {
          if (getLocalSessionState() !== 'mismatch') {
            setAvailabilityFailure(res.status === 403 ? 'permission' : 'server')
            setLocalSessionState('unavailable')
          }
        }
      } catch {
        if (version === generation.current && getLocalSessionState() !== 'mismatch') {
          setAvailabilityFailure('connection')
          setLocalSessionState('unavailable')
        }
      } finally {
        if (version === generation.current) {
          setLoading(false)
          setCheckingSession(false)
        }
      }
    })()
    checking.current = pending
    void pending.finally(() => { if (checking.current === pending) checking.current = null })
    return pending
  }, [initialize, publishUser])

  useEffect(() => {
    setLocalSessionState('checking')
    revoked.current = false
    const stopVerifier = registerSessionVerifier(loadUser)
    void loadUser()
    const stopLost = onSessionLost(() => {
      setReloading(false)
      setLocalSessionState('reauth')
      // Exhausted navigation budget is sync state, not local identity loss.
    })
    const stopReauth = onReauthStateChange(() => {
      setReauthPending(isReauthDeferred())
      if (isReauthDeferred()) setLocalSessionState('reauth')
    })
    const seen = new Set<string>()
    const receiveBoundary = (kind: string, nonce: string) => {
      if ((kind !== 'logout' && kind !== 'mismatch') || seen.has(nonce)) return
      seen.add(nonce)
      generation.current++
      checking.current = null
      setCheckingSession(false)
      setLocalSessionState(kind === 'logout' ? 'logged-out' : 'mismatch')
      if (kind === 'logout') {
        revoked.current = true
        clearCachedIdentity()
        publishUser(null)
        setLoading(false)
      }
    }
    const onBoundary = (event: StorageEvent) => {
      if (event.key !== BOUNDARY_KEY || !event.newValue) return
      try {
        const { kind, nonce } = JSON.parse(event.newValue)
        receiveBoundary(kind, nonce)
      } catch { /* malformed event */ }
    }
    const stopBoundary = subscribeCrossTab(message => {
      if (message.kind === 'auth-boundary') receiveBoundary(message.boundary, message.nonce)
    })
    window.addEventListener('storage', onBoundary)
    return () => {
      generation.current++
      bootstrap.current = null
      checking.current = null
      setLocalSessionState('checking')
      stopVerifier(); stopLost(); stopReauth(); stopBoundary()
      window.removeEventListener('storage', onBoundary)
    }
  }, [loadUser, publishUser])

  useEffect(() => { setLiveEventsUser(session === 'live' ? user?.id ?? null : null) }, [user, session])
  const lastCheck = useRef(0)
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck.current < 5_000) return
      lastCheck.current = Date.now()
      void loadUser()
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    window.addEventListener('online', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
      window.removeEventListener('online', recheck)
    }
  }, [loadUser])

  /**
   * Accepting a family invitation moves the account to another family, which
   * otherwise reads as an owner mismatch and wedges the workspace. The move is
   * server-confirmed and client-initiated, so re-bind the durable owner (and
   * the identity this tab holds) before verifying the new session.
   */
  const joinFamily = useCallback(async (familyId: string) => {
    // Any /me still in flight predates the move; its answer would read as a
    // mismatch against the family we are about to bind.
    generation.current++
    checking.current = null
    await rebindLocalOwnerFamily(familyId)
    if (current.current) publishUser({ ...current.current, familyId })
    if (cached.current) cached.current = { ...cached.current, familyId }
    await loadUser()
  }, [loadUser, publishUser])

  const logout = useCallback(async () => {
    // Revoke before awaiting transport, so a hanging logout or older /me cannot
    // resurrect local access. Keep the durable owner and all pending work.
    generation.current++
    revoked.current = true
    setCheckingSession(false)
    setLocalSessionState('logged-out')
    clearCachedIdentity()
    publishUser(null)
    setLoading(false)
    announceBoundary('logout')
    // Survives blocked/quota-failing localStorage cache removal. The durable
    // owner/outbox remain untouched; only a fresh matching live proof clears it.
    await setSyncMeta('auth:loggedOut', true).catch(() => {})
    try { await fetchWithTimeout(`${base}/auth/logout`, { method: 'POST' }, AUTH_FETCH_TIMEOUT_MS) } catch { /* navigation handles recovery */ }
    await navigateForLogin()
  }, [publishUser])

  const value = useMemo<AuthContextValue>(() => ({ user, loading, reloading, checkingSession, reauthPending,
    liveSession: session === 'live', accountMismatch: session === 'mismatch', availabilityFailure, logout, refreshUser: loadUser, joinFamily,
  }), [user, loading, reloading, checkingSession, reauthPending, session, availabilityFailure, logout, loadUser, joinFamily])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
