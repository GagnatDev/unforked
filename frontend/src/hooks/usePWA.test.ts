import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RegisterSWOptions = {
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void
  onRegisterError?: (error: unknown) => void
}

const updateServiceWorker = vi.fn(() => Promise.resolve())
let registerOptions: RegisterSWOptions = {}

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: RegisterSWOptions) => {
    registerOptions = options
    return { needRefresh: [false, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker }
  },
}))

const { usePWA, useForegroundResume } = await import('./usePWA')

let visibility: DocumentVisibilityState = 'visible'
let update: ReturnType<typeof vi.fn>

function setVisibility(state: DocumentVisibilityState) {
  visibility = state
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Mount usePWA and hand it a registration, as vite-plugin-pwa does on register. */
function renderRegistered() {
  const rendered = renderHook(() => usePWA())
  act(() => {
    registerOptions.onRegisteredSW?.('/sw.js', {
      update,
    } as unknown as ServiceWorkerRegistration)
  })
  return rendered
}

beforeEach(() => {
  vi.useFakeTimers()
  update = vi.fn(() => Promise.resolve())
  registerOptions = {}
  updateServiceWorker.mockClear()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePWA update checks', () => {
  it('checks for a new version when the app is brought back to the foreground', () => {
    renderRegistered()
    // Registering just fetched sw.js, so the check is throttled until it ages out.
    expect(update).not.toHaveBeenCalled()

    setVisibility('hidden')
    act(() => vi.advanceTimersByTime(5 * 60 * 1000))
    setVisibility('visible')

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('collapses the events a single resume fires into one check', () => {
    renderRegistered()
    act(() => vi.advanceTimersByTime(2 * 60 * 1000))

    setVisibility('visible')
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
      window.dispatchEvent(new Event('focus'))
    })

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('ignores foreground events while the app is still hidden', () => {
    renderRegistered()
    act(() => vi.advanceTimersByTime(2 * 60 * 1000))
    visibility = 'hidden'

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(update).not.toHaveBeenCalled()
  })

  it('still checks periodically for a client that is simply left open', () => {
    renderRegistered()

    act(() => vi.advanceTimersByTime(60 * 60 * 1000))

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('checks again when the connection comes back', () => {
    renderRegistered()
    act(() => vi.advanceTimersByTime(2 * 60 * 1000))

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('survives a rejected check (offline) and keeps checking', async () => {
    update = vi.fn(() => Promise.reject(new Error('offline')))
    renderRegistered()

    act(() => vi.advanceTimersByTime(60 * 60 * 1000))
    await act(async () => {})
    act(() => vi.advanceTimersByTime(60 * 60 * 1000))

    expect(update).toHaveBeenCalledTimes(2)
  })

  it('stops checking once the hook is unmounted', () => {
    const { unmount } = renderRegistered()
    unmount()

    act(() => vi.advanceTimersByTime(4 * 60 * 60 * 1000))

    expect(update).not.toHaveBeenCalled()
  })
})

describe('usePWA applyUpdate', () => {
  it('activates the waiting worker and reloads if it never takes control', () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })

    const { result } = renderRegistered()
    act(() => result.current.applyUpdate())

    expect(updateServiceWorker).toHaveBeenCalledWith(true)
    expect(reload).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(5000))
    expect(reload).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })
})

describe('useForegroundResume', () => {
  it('runs only after the app has been away for the given time', () => {
    const onResume = vi.fn()
    renderHook(() => useForegroundResume(onResume, 30 * 60 * 1000))

    setVisibility('hidden')
    act(() => vi.advanceTimersByTime(10 * 60 * 1000))
    setVisibility('visible')
    expect(onResume).not.toHaveBeenCalled()

    setVisibility('hidden')
    act(() => vi.advanceTimersByTime(31 * 60 * 1000))
    setVisibility('visible')
    expect(onResume).toHaveBeenCalledTimes(1)
  })
})
