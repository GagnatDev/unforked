import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { navigateForLogin, reloadForLogin } from '@/lib/session'

export type UserInfo = { id: string; email: string; role: string; familyId: string }

type AuthContextValue = {
  user: UserInfo | null
  loading: boolean
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

  const loadUser = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${base}/api/auth/me`)
      if (res.ok) {
        setUser((await res.json()) as UserInfo)
        return
      }
      if (res.status === 401) reloadForLogin()
      setUser(null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void loadUser().finally(() => setLoading(false))
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
    () => ({ user, loading, logout, refreshUser }),
    [user, loading, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
