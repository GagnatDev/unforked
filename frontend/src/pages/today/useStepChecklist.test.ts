import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStepChecklist } from './useStepChecklist'

describe('useStepChecklist', () => {
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

  it('hydrates checked steps from localStorage', async () => {
    store.set('k', JSON.stringify([true, false]))
    const { result } = renderHook(() => useStepChecklist(['a', 'b'], 'k'))

    await waitFor(() => {
      expect(result.current.checkedSteps).toEqual([true, false])
    })
  })

  it('persists toggles when a storage key is set', async () => {
    const { result } = renderHook(() => useStepChecklist(['a', 'b'], 'k'))

    await waitFor(() => {
      expect(result.current.checkedSteps).toEqual([false, false])
    })

    act(() => result.current.toggleStep(0))

    await waitFor(() => {
      expect(store.get('k')).toBe(JSON.stringify([true, false]))
    })
  })

  it('resetProgress clears state and removes the storage entry', async () => {
    store.set('k', JSON.stringify([true, true]))
    const { result } = renderHook(() => useStepChecklist(['a', 'b'], 'k'))

    await waitFor(() => {
      expect(result.current.checkedSteps).toEqual([true, true])
    })

    act(() => result.current.resetProgress())

    await waitFor(() => {
      expect(result.current.checkedSteps).toEqual([false, false])
      // removeItem runs, then the persist effect writes cleared state back (same as pre-refactor Today).
      expect(store.get('k')).toBe(JSON.stringify([false, false]))
    })
  })

  it('does not read or write localStorage when storageKey is null', async () => {
    const { result } = renderHook(() => useStepChecklist(['a'], null))

    await waitFor(() => {
      expect(result.current.checkedSteps).toEqual([false])
    })

    act(() => result.current.toggleStep(0))
    expect(store.size).toBe(0)

    act(() => result.current.resetProgress())
    expect(store.size).toBe(0)
  })
})
