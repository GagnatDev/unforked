import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { markAuthenticated, navigateForLogin, onSessionLost } from '@/lib/session'
import {
  clearDeferredReauth,
  isReauthDeferred,
  onReauthStateChange,
  requestReauth,
  setSessionEstablished,
} from '@/lib/reauth'
import { setLiveEventsUser } from '@/local/liveEvents'

export type UserInfo = { id: string; email: string; role: string; familyId: string }

type AuthContextValue = {
  user: UserInfo | null
  loading: boolean
  /**
   * A silent re-auth full page load has been triggered and is in flight. The UI
   * shows a spinner (not the manual session-expired screen) because the page is
   * about to reload on its own.
   */
  reloading: boolean
  /**
   * The session was lost while unsynced work is queued, so the re-auth reload
   * is deferred to a natural break (offline-first A7). The UI shows a quiet
   * "will sync when you sign back in" indicator rather than reloading mid-edit.
   */
  reauthPending: boolean
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const base = import.meta.env.VITE_API_URL ?? ''

/**
 * Loads the identity resolved by the backend from the auth sidecar's headers.
 * The SPA is auth-agnostic: no token, no login form — the sidecar redirects
 * unauthenticated top-level navigations to central login, and 401s on XHRs are
 * answered with a full page load so that redirect can happen.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [reauthPending, setReauthPending] = useState(isReauthDeferred)

  const loadUser = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${base}/api/auth/me`)
      if (res.ok) {
        // A confirmed identity means the session is healthy again: clear the
        // re-auth loop counters and any deferred re-auth so a later expiry
        // starts fresh, and mark the session established so a future 401 while
        // editing is deferred rather than reloading mid-edit (offline-first A7).
        markAuthenticated()
        clearDeferredReauth()
        setReloading(false)
        setSessionEstablished(true)
        setUser((await res.json()) as UserInfo)
        return
      }
      if (res.status === 401) {
        // Let the classifier decide: reload now (silent re-auth in flight),
        // defer behind queued work, or — offline — do nothing. Keep the current
        // identity except when the session is truly lost.
        const disposition = await requestReauth()
        if (disposition === 'reloading') {
          // Show a spinner instead of flashing the manual screen for the moment
          // before the page reloads itself.
          setReloading(true)
          return
        }
        if (disposition === 'deferred' || disposition === 'offline') return
        setUser(null)
        return
      }
      setUser(null)
    } catch {
      // A thrown fetch is a network error (offline / sidecar unreachable), never
      // a session loss — do not blank the identity or navigate. Keeping the last
      // identity is what lets offline reads keep working (offline-first A7).
    }
  }, [])

  useEffect(() => {
    void loadUser().finally(() => setLoading(false))
  }, [loadUser])

  // A data request may hit a 401 and exhaust the silent re-auth budget without
  // this provider being the one that observed it. Drop the identity when that
  // happens so RequireAuth can surface the manual session-expired screen.
  useEffect(
    () =>
      onSessionLost(() => {
        setReloading(false)
        setSessionEstablished(false)
        clearDeferredReauth()
        setUser(null)
      }),
    []
  )

  // Feed the live-events client the authenticated identity (design #104 D3):
  // the SSE stream exists only while signed in, and its own-write echo gating
  // needs the user id to recognize this user's changes coming back.
  useEffect(() => {
    setLiveEventsUser(user?.id ?? null)
  }, [user])

  // Reflect the deferred-reauth flag (set by the classifier when a 401 lands
  // with unsynced work queued) so the UI can show the quiet "will sync" state.
  useEffect(
    () => onReauthStateChange(() => setReauthPending(isReauthDeferred())),
    []
  )

  // Proactively re-check the session when the tab regains focus. On mobile the
  // app is typically backgrounded for a long time, so the session often expires
  // while it is hidden; re-checking on return lets the silent reload happen
  // before the user taps anything, rather than surfacing a mid-action 401.
  const lastCheckRef = useRef(0)
  useEffect(() => {
    const RECHECK_THROTTLE_MS = 5_000
    const recheck = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastCheckRef.current < RECHECK_THROTTLE_MS) return
      lastCheckRef.current = now
      void loadUser()
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [loadUser])

  const refreshUser = useCallback(async () => {
    await loadUser()
  }, [loadUser])

  const logout = useCallback(async () => {
    // The sidecar owns /auth/logout and clears the hs_session cookie; the
    // follow-up navigation lets it redirect to login again. It must bypass the
    // service worker cache, or the sidecar never sees the navigation.
    try {
      await fetch(`${base}/auth/logout`, { method: 'POST' })
    } catch {
      // Ignore — navigating away is the important part.
    }
    setSessionEstablished(false)
    await navigateForLogin()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, reloading, reauthPending, logout, refreshUser }),
    [user, loading, reloading, reauthPending, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
