import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStored, removeStored, writeStored } from './storage'

describe('storage', () => {
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

  it('round-trips a value and removes it', () => {
    writeStored('k', 'v')
    expect(readStored('k')).toBe('v')
    removeStored('k')
    expect(readStored('k')).toBeNull()
  })

  it('returns null for a key that was never written', () => {
    expect(readStored('missing')).toBeNull()
  })

  it('degrades to no-ops when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })

    expect(() => writeStored('k', 'v')).not.toThrow()
    expect(() => removeStored('k')).not.toThrow()
    expect(readStored('k')).toBeNull()
  })

  it('degrades to no-ops when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(() => writeStored('k', 'v')).not.toThrow()
    expect(readStored('k')).toBeNull()
  })
})
