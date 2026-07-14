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
import {
  markAuthenticated,
  navigateForLogin,
  onSessionLost,
  reloadForLogin,
} from '@/lib/session'

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

  const loadUser = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${base}/api/auth/me`)
      if (res.ok) {
        // A confirmed identity means the session is healthy again: clear the
        // re-auth loop counters so a later expiry gets a fresh set of attempts.
        markAuthenticated()
        setReloading(false)
        setUser((await res.json()) as UserInfo)
        return
      }
      // A silent re-auth navigation was triggered: keep the identity as-is and
      // flag the reload so the UI shows a spinner instead of flashing the
      // manual session-expired screen for the moment before the page reloads.
      if (res.status === 401 && reloadForLogin()) {
        setReloading(true)
        return
      }
      setUser(null)
    } catch {
      setUser(null)
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
        setUser(null)
      }),
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
    await navigateForLogin()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, reloading, logout, refreshUser }),
    [user, loading, reloading, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
