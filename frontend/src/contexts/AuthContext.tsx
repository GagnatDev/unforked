import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '@/api'
import * as authStore from '@/lib/authStore'

export type UserInfo = { id: string; email: string; role: string; familyId: string }

const DEV_USER: UserInfo = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@local.test',
  role: 'admin',
  familyId: '00000000-0000-4000-8000-0000000000f1',
}

type AuthContextValue = {
  user: UserInfo | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setup: (email: string, password: string) => Promise<void>
  registerWithInvite: (token: string, email: string, password: string) => Promise<void>
  refreshUser: () => Promise<void>
  authDisabled: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const base = import.meta.env.VITE_API_URL ?? ''

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
      const data = await api.auth.login({ email, password })
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
      const data = await api.auth.setup({ email, password })
      setToken(data.token)
      setUser(data.user)
    },
    [authDisabled, setToken]
  )

  const registerWithInvite = useCallback(
    async (inviteToken: string, email: string, password: string) => {
      if (authDisabled) return
      const data = await api.auth.registerWithInvite({ token: inviteToken, email, password })
      setToken(data.token)
      setUser(data.user)
    },
    [authDisabled, setToken]
  )

  const refreshUser = useCallback(async () => {
    if (authDisabled) return
    const t = authStore.getToken()
    if (!t) return
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (res.ok) {
      const u = (await res.json()) as UserInfo
      setUser(u)
    }
  }, [authDisabled])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: authDisabled ? DEV_USER : user,
      token: authDisabled ? null : token,
      loading: authDisabled ? false : loading,
      login,
      logout,
      setup,
      registerWithInvite,
      refreshUser,
      authDisabled,
    }),
    [authDisabled, user, token, loading, login, logout, setup, registerWithInvite, refreshUser]
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
