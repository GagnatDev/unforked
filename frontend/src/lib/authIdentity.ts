import { readStored, removeStored, writeStored } from '@/lib/storage'

/** Shape mirrored from AuthContext — kept here to avoid an import cycle. */
export type CachedUserInfo = {
  id: string
  email: string
  role: string
  familyId: string
}

/**
 * Last successfully confirmed identity for offline / poor-network cold starts.
 *
 * Auth is cookie-based (no SPA token), but `RequireAuth` still needs a user
 * object before the shell mounts. Persisting the last `/api/auth/me` payload
 * lets a previously hydrated PWA open from IndexedDB when `/me` stalls or fails,
 * matching offline-first A7 (keep identity across network loss).
 */
const AUTH_IDENTITY_KEY = 'auth:lastUser'

function isUserInfo(value: unknown): value is CachedUserInfo {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.email === 'string' &&
    typeof v.role === 'string' &&
    typeof v.familyId === 'string'
  )
}

export function readCachedIdentity(): CachedUserInfo | null {
  const raw = readStored(AUTH_IDENTITY_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isUserInfo(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeCachedIdentity(user: CachedUserInfo): void {
  writeStored(AUTH_IDENTITY_KEY, JSON.stringify(user))
}

export function clearCachedIdentity(): void {
  removeStored(AUTH_IDENTITY_KEY)
}
