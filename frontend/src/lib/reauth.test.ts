import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The classifier decides whether/when to navigate; the actual navigation
// (reloadForLogin) and the outbox count are its two collaborators, both mocked.
const reloadForLogin = vi.fn(() => true)
const countOutboxOps = vi.fn(async () => 0)

vi.mock('./session', () => ({ reloadForLogin: () => reloadForLogin() }))
vi.mock('@/local/db', () => ({ countOutboxOps: () => countOutboxOps() }))

import { __resetCrossTabForTests, startLeaderElection } from '@/local/crossTab'
import {
  __resetReauthForTests,
  clearDeferredReauth,
  isReauthDeferred,
  onReauthStateChange,
  requestReauth,
  setSessionEstablished,
  startReauthCrossTab,
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
  __resetCrossTabForTests()
  reloadForLogin.mockClear().mockReturnValue(true)
  countOutboxOps.mockClear().mockResolvedValue(0)
  setOnline(true)
  setVisibility('visible')
})

afterEach(() => {
  __resetReauthForTests()
  __resetCrossTabForTests()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
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

describe('multi-tab coordination (phase 6)', () => {
  const CHANNEL_NAME = 'unforked-cross-tab'

  /**
   * Yield to the event loop until `predicate` holds. Cross-tab delivery goes
   * through a `BroadcastChannel`, which hands messages off asynchronously with no
   * guarantee they land within a single macrotask — polling for the expected
   * effect is deterministic where a fixed `setTimeout(0)` races the assertion.
   */
  async function waitFor(predicate: () => boolean): Promise<void> {
    for (let i = 0; i < 50; i++) {
      if (predicate()) return
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(predicate(), 'waitFor: condition not met in time').toBe(true)
  }

  /** Emulate Web Locks that never grant, so this tab stays a follower. */
  function stubUngrantedLocks(): void {
    const locks = { request: () => new Promise<void>(() => {}) }
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  }

  it('a follower hands re-auth to the leader without navigating itself', async () => {
    stubUngrantedLocks()
    startLeaderElection() // this tab gives up leadership; the lock never grants
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(0)

    const leaderTab = new BroadcastChannel(CHANNEL_NAME)
    const seen: unknown[] = []
    leaderTab.onmessage = (event: MessageEvent) => seen.push(event.data)

    expect(await requestReauth()).toBe('deferred')
    await waitFor(() => seen.length > 0)
    leaderTab.close()

    // A follower must never call reloadForLogin — the leader owns navigation.
    expect(reloadForLogin).not.toHaveBeenCalled()
    expect(seen).toContainEqual({ kind: 'reauth-request' })
  })

  it('the leader drives the navigation when a follower requests re-auth', async () => {
    startReauthCrossTab() // this tab (sole leader by default) listens
    setSessionEstablished(true)
    countOutboxOps.mockResolvedValue(0)

    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ kind: 'reauth-request' })
    await waitFor(() => reloadForLogin.mock.calls.length > 0)
    otherTab.close()

    expect(reloadForLogin).toHaveBeenCalledTimes(1)
  })

  it('mirrors another tab’s pending indicator', async () => {
    startReauthCrossTab()
    const handler = vi.fn()
    const unsubscribe = onReauthStateChange(handler)
    expect(isReauthDeferred()).toBe(false)

    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ kind: 'reauth-state', pending: true })
    await waitFor(() => isReauthDeferred())
    expect(isReauthDeferred()).toBe(true)
    expect(handler).toHaveBeenCalled()

    otherTab.postMessage({ kind: 'reauth-state', pending: false })
    await waitFor(() => !isReauthDeferred())
    expect(isReauthDeferred()).toBe(false)

    otherTab.close()
    unsubscribe()
  })

  it('broadcasts a healthy session so peers drop the indicator', async () => {
    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    const seen: unknown[] = []
    otherTab.onmessage = (event: MessageEvent) => seen.push(event.data)

    // A freshly reloaded tab confirms auth and clears — even with nothing local.
    clearDeferredReauth()
    await waitFor(() => seen.length > 0)
    otherTab.close()

    expect(seen).toContainEqual({ kind: 'reauth-state', pending: false })
  })
})
