import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistedFlag } from './usePersistedFlag'

describe('usePersistedFlag', () => {
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

  it('starts from the default and persists changes', () => {
    const { result } = renderHook(() => usePersistedFlag('flag'))
    expect(result.current[0]).toBe(false)

    act(() => result.current[1](true))

    expect(result.current[0]).toBe(true)
    expect(store.get('flag')).toBe('1')
  })

  it('hydrates a stored flag', () => {
    store.set('flag', '1')
    const { result } = renderHook(() => usePersistedFlag('flag'))
    expect(result.current[0]).toBe(true)
  })

  it('honours a stored "off" over a true default', () => {
    store.set('flag', '0')
    const { result } = renderHook(() => usePersistedFlag('flag', true))
    expect(result.current[0]).toBe(false)
  })

  it('does not write anything on mount', () => {
    renderHook(() => usePersistedFlag('flag'))
    expect(store.has('flag')).toBe(false)
  })
})
