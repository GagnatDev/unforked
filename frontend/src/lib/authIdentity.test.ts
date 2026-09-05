import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCachedIdentity,
  readCachedIdentity,
  writeCachedIdentity,
} from './authIdentity'

describe('authIdentity cache', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a valid identity', () => {
    const user = {
      id: 'u1',
      email: 'a@b.c',
      role: 'admin',
      familyId: 'f1',
    }
    writeCachedIdentity(user)
    expect(readCachedIdentity()).toEqual(user)
  })

  it('returns null for missing, corrupt, or incomplete payloads', () => {
    expect(readCachedIdentity()).toBeNull()
    store.set('auth:lastUser', '{not-json')
    expect(readCachedIdentity()).toBeNull()
    store.set('auth:lastUser', JSON.stringify({ id: 'u1', email: 'a@b.c' }))
    expect(readCachedIdentity()).toBeNull()
  })

  it('clears the cached identity', () => {
    writeCachedIdentity({
      id: 'u1',
      email: 'a@b.c',
      role: 'member',
      familyId: 'f1',
    })
    clearCachedIdentity()
    expect(readCachedIdentity()).toBeNull()
  })
})
