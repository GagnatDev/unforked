import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

describe('useWakeLock', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  })

  it('reports unsupported when Wake Lock API is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator },
      configurable: true,
      writable: true,
    })

    const { result } = renderHook(() => useWakeLock(false))
    expect(result.current.wakeLockSupported).toBe(false)
  })

  it('requests a screen wake lock when keepAwake becomes true', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const sentinel = {
      release,
      addEventListener: vi.fn(),
    }
    const request = vi.fn().mockResolvedValue(sentinel)

    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, wakeLock: { request } },
      configurable: true,
      writable: true,
    })

    const { result, rerender } = renderHook(({ awake }) => useWakeLock(awake), {
      initialProps: { awake: false },
    })

    await waitFor(() => {
      expect(result.current.wakeLockSupported).toBe(true)
    })

    rerender({ awake: true })

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen')
    })
  })

  it('releases the wake lock when keepAwake becomes false', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const sentinel = {
      release,
      addEventListener: vi.fn(),
    }
    const request = vi.fn().mockResolvedValue(sentinel)

    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, wakeLock: { request } },
      configurable: true,
      writable: true,
    })

    const { result, rerender } = renderHook(({ awake }) => useWakeLock(awake), {
      initialProps: { awake: true },
    })

    await waitFor(() => {
      expect(result.current.wakeLockSupported).toBe(true)
      expect(request).toHaveBeenCalled()
    })

    rerender({ awake: false })

    await waitFor(() => {
      expect(release).toHaveBeenCalled()
    })
  })
})
