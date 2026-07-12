import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A settable window.location stub — jsdom's real location throws on navigation.
function stubLocation(pathname = '/recipes/42', search = '?tab=x', hash = '') {
  const location = { pathname, search, hash, href: '' }
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: location,
  })
  return location
}

describe('session re-auth coordination', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
    stubLocation()
    // No service worker in jsdom — navigateForLogin skips the unregister step.
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('navigates to the current location, preserving the user place', async () => {
    const location = stubLocation('/recipes/42', '?tab=x', '#s')
    const { navigateForLogin } = await import('./session')
    await navigateForLogin()
    expect(location.href).toBe('/recipes/42?tab=x#s')
  })

  it('triggers a navigation on the first 401', async () => {
    const { reloadForLogin } = await import('./session')
    expect(reloadForLogin()).toBe(true)
  })

  it('stops navigating and reports session lost once the attempt cap is hit', async () => {
    vi.useFakeTimers()
    const mod = await import('./session')
    const lost = vi.fn()
    mod.onSessionLost(lost)

    // Each attempt is a fresh page load in reality; reset the in-page guard by
    // re-importing the module so `navigating` starts false again.
    for (let i = 0; i < 2; i++) {
      vi.resetModules()
      const fresh = await import('./session')
      expect(fresh.reloadForLogin()).toBe(true)
      vi.advanceTimersByTime(1_000)
    }

    vi.resetModules()
    const capped = await import('./session')
    capped.onSessionLost(lost)
    expect(capped.reloadForLogin()).toBe(false)
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('resets the attempt budget after a confirmed authenticated load', async () => {
    vi.useFakeTimers()
    // Burn the budget.
    for (let i = 0; i < 2; i++) {
      vi.resetModules()
      const fresh = await import('./session')
      fresh.reloadForLogin()
      vi.advanceTimersByTime(1_000)
    }
    vi.resetModules()
    const afterAuth = await import('./session')
    afterAuth.markAuthenticated()
    // With the counters cleared, the next expiry navigates again.
    expect(afterAuth.reloadForLogin()).toBe(true)
  })

  it('starts a fresh budget once the guard window has elapsed', async () => {
    vi.useFakeTimers()
    for (let i = 0; i < 2; i++) {
      vi.resetModules()
      const fresh = await import('./session')
      fresh.reloadForLogin()
      vi.advanceTimersByTime(1_000)
    }
    // Move past the 15s window: stale attempts no longer count.
    vi.advanceTimersByTime(15_001)
    vi.resetModules()
    const later = await import('./session')
    expect(later.reloadForLogin()).toBe(true)
  })

  it('deduplicates a burst of 401s within one page load into one navigation', async () => {
    const { reloadForLogin } = await import('./session')
    reloadForLogin()
    reloadForLogin()
    reloadForLogin()
    // Only the first attempt was recorded; the rest short-circuit on `navigating`.
    expect(sessionStorage.getItem('auth_reload_attempts')).toBe('1')
  })
})
