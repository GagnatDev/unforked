import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as authStore from '@/lib/authStore'

export type UserInfo = { id: string; email: string; role: string }

const DEV_USER: UserInfo = {
  id: 'dev-id',
  email: 'dev@local',
  role: 'admin',
}

type AuthContextValue = {
  user: UserInfo | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setup: (email: string, password: string) => Promise<void>
  authDisabled: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const base = import.meta.env.VITE_API_URL ?? ''

async function authRequest<T>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [token, setTokenState] = useState<string | null>(authStore.getToken())
  const [loading, setLoading] = useState(true)
  const authDisabled = authStore.getAuthDisabled()

  const setToken = useCallback((t: string | null) => {
    if (t) authStore.setToken(t)
    else authStore.clearToken()
    setTokenState(t)
  }, [])

  const loadUser = useCallback(async () => {
    const t = authStore.getToken()
    if (!t) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const u = (await res.json()) as UserInfo
        setUser(u)
      } else {
        authStore.clearToken()
        setTokenState(null)
        setUser(null)
      }
    } catch {
      authStore.clearToken()
      setTokenState(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authDisabled) {
      setUser(DEV_USER)
      setTokenState(null)
      setLoading(false)
      return
    }
    loadUser()
  }, [authDisabled, loadUser])

  useEffect(() => {
    if (authDisabled) return
    authStore.setOnUnauthorized(() => {
      setTokenState(null)
      setUser(null)
      window.location.href = '/login'
    })
    return () => authStore.setOnUnauthorized(() => {})
  }, [authDisabled])

  const login = useCallback(
    async (email: string, password: string) => {
      if (authDisabled) return
      const data = await authRequest<{ token: string; user: UserInfo }>(
        '/api/auth/login',
        { email, password }
      )
      setToken(data.token)
      setUser(data.user)
    },
    [authDisabled, setToken]
  )

  const logout = useCallback(() => {
    if (authDisabled) return
    authStore.clearToken()
    setTokenState(null)
    setUser(null)
  }, [authDisabled])

  const setup = useCallback(
    async (email: string, password: string) => {
      if (authDisabled) return
      const data = await authRequest<{ token: string; user: UserInfo }>(
        '/api/auth/setup',
        { email, password }
      )
      setToken(data.token)
      setUser(data.user)
    },
    [authDisabled, setToken]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user: authDisabled ? DEV_USER : user,
      token: authDisabled ? null : token,
      loading: authDisabled ? false : loading,
      login,
      logout,
      setup,
      authDisabled,
    }),
    [authDisabled, user, token, loading, login, logout, setup]
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
