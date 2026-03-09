const TOKEN_KEY = 'auth_token'

let token: string | null =
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
let onUnauthorized: (() => void) | null = null

export function getAuthDisabled(): boolean {
  return import.meta.env.VITE_DISABLE_AUTH === 'true'
}

export function getToken(): string | null {
  return token
}

export function setToken(t: string): void {
  token = t
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, t)
}

export function clearToken(): void {
  token = null
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY)
}

export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn
}

export function triggerUnauthorized(): void {
  clearToken()
  onUnauthorized?.()
}
