import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The classifier decides whether/when to navigate; the actual navigation
// (reloadForLogin) and the outbox count are its two collaborators, both mocked.
const reloadForLogin = vi.fn(() => true)
const countOutboxOps = vi.fn(async () => 0)

vi.mock('./session', () => ({ reloadForLogin: () => reloadForLogin() }))
vi.mock('@/local/db', () => ({ countOutboxOps: () => countOutboxOps() }))

import {
  __resetReauthForTests,
  clearDeferredReauth,
  isReauthDeferred,
  onReauthStateChange,
  requestReauth,
  setSessionEstablished,
} from './reauth'

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

function fireVisibilityChange(state: DocumentVisibilityState): void {
  setVisibility(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  __resetReauthForTests()
  reloadForLogin.mockClear().mockReturnValue(true)
  countOutboxOps.mockClear().mockResolvedValue(0)
  setOnline(true)
  setVisibility('visible')
})

afterEach(() => {
  __resetReauthForTests()
})

describe('requestReauth — classification', () => {
  it('never navigates while offline', async () => {
    setOnline(false)
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(3)

    expect(await requestReauth()).toBe('offline')
    expect(reloadForLogin).not.toHaveBeenCalled()
    expect(isReauthDeferred()).toBe(false)
  })

  it('reloads immediately on a cold start / pre-auth 401 (no session to protect)', async () => {
    // sessionEstablished defaults to false; queued work must not block the reload.
    countOutboxOps.mockResolvedValue(5)

    expect(await requestReauth()).toBe('reloading')
    expect(reloadForLogin).toHaveBeenCalledTimes(1)
    expect(countOutboxOps).not.toHaveBeenCalled()
  })

  it('reports the session lost when the reload attempt cap is hit', async () => {
    reloadForLogin.mockReturnValue(false)
    expect(await requestReauth()).toBe('lost')
  })

  it('reloads immediately mid-session when nothing is queued', async () => {
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(0)

    expect(await requestReauth()).toBe('reloading')
    expect(reloadForLogin).toHaveBeenCalledTimes(1)
    expect(isReauthDeferred()).toBe(false)
  })

  it('defers mid-session when unsynced work is queued', async () => {
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(2)

    expect(await requestReauth()).toBe('deferred')
    expect(reloadForLogin).not.toHaveBeenCalled()
    expect(isReauthDeferred()).toBe(true)
  })

  it('coalesces repeated 401s while a deferral is pending', async () => {
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(1)

    await requestReauth()
    countOutboxOps.mockClear()
    expect(await requestReauth()).toBe('deferred')
    // Already pending: no second outbox read, still no navigation.
    expect(countOutboxOps).not.toHaveBeenCalled()
    expect(reloadForLogin).not.toHaveBeenCalled()
  })
})

describe('deferred re-auth — natural break', () => {
  beforeEach(() => {
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(1)
  })

  it('navigates once the tab goes hidden and comes back visible', async () => {
    await requestReauth()
    expect(reloadForLogin).not.toHaveBeenCalled()

    fireVisibilityChange('hidden')
    expect(reloadForLogin).not.toHaveBeenCalled()

    fireVisibilityChange('visible')
    expect(reloadForLogin).toHaveBeenCalledTimes(1)
  })

  it('does not navigate on a visible event that was never preceded by hidden', async () => {
    await requestReauth()
    fireVisibilityChange('visible')
    expect(reloadForLogin).not.toHaveBeenCalled()
  })

  it('treats a 401 seen while already hidden as ready to break on return', async () => {
    setVisibility('hidden')
    await requestReauth()

    fireVisibilityChange('visible')
    expect(reloadForLogin).toHaveBeenCalledTimes(1)
  })

  it('does not navigate after the deferral is cleared', async () => {
    await requestReauth()
    clearDeferredReauth()
    expect(isReauthDeferred()).toBe(false)

    fireVisibilityChange('hidden')
    fireVisibilityChange('visible')
    expect(reloadForLogin).not.toHaveBeenCalled()
  })
})

describe('deferred re-auth — state notifications', () => {
  it('emits on defer and on clear', async () => {
    const handler = vi.fn()
    const unsubscribe = onReauthStateChange(handler)
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(1)

    await requestReauth()
    expect(handler).toHaveBeenCalledTimes(1)

    clearDeferredReauth()
    expect(handler).toHaveBeenCalledTimes(2)

    unsubscribe()
    clearDeferredReauth()
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
