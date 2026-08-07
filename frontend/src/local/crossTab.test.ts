import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetCrossTabForTests,
  type CrossTabMessage,
  isLeader,
  onBecomeLeader,
  postCrossTab,
  startLeaderElection,
  subscribeCrossTab,
} from './crossTab'
import { waitFor } from '@/test/waitFor'

const CHANNEL_NAME = 'unforked-cross-tab'

/** Emulate the Web Locks API, granting queued lock requests on demand. */
function stubWebLocks(): { grantNext: () => void } {
  const grants: Array<() => void> = []
  const locks = {
    request: (_name: string, callback: () => Promise<never>) =>
      new Promise<void>(() => {
        // The real API runs the callback once the lock is held; queue it so the
        // test controls exactly when this tab is granted leadership.
        grants.push(() => void callback())
      }),
  }
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  return {
    grantNext: () => grants.shift()?.(),
  }
}

function clearWebLocks(): void {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
}

beforeEach(() => {
  __resetCrossTabForTests()
  clearWebLocks()
})

afterEach(() => {
  __resetCrossTabForTests()
  clearWebLocks()
})

describe('cross-tab message bus', () => {
  it('delivers a message posted from another tab to subscribers', async () => {
    const received: CrossTabMessage[] = []
    subscribeCrossTab((message) => received.push(message))

    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ kind: 'local-write', stores: ['recipes'] })
    await waitFor(() => received.length > 0)
    otherTab.close()

    expect(received).toEqual([{ kind: 'local-write', stores: ['recipes'] }])
  })

  it('broadcasts a posted message to other tabs but not back to the sender', async () => {
    const own = vi.fn()
    subscribeCrossTab(own)

    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    const seen: CrossTabMessage[] = []
    otherTab.onmessage = (event: MessageEvent<CrossTabMessage>) => seen.push(event.data)

    postCrossTab({ kind: 'outbox-kick' })
    await waitFor(() => seen.length > 0)
    otherTab.close()

    // A BroadcastChannel never echoes to the sender, so our own handler is quiet.
    expect(own).not.toHaveBeenCalled()
    expect(seen).toEqual([{ kind: 'outbox-kick' }])
  })

  it('stops delivering after unsubscribe', async () => {
    const handler = vi.fn()
    const unsubscribe = subscribeCrossTab(handler)
    unsubscribe()
    // A still-subscribed witness on the same channel: once it has seen the
    // message the delivery has happened, so a quiet `handler` means unsubscribe
    // worked rather than that the assertion merely ran too early.
    const witness = vi.fn()
    subscribeCrossTab(witness)

    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ kind: 'outbox-kick' })
    await waitFor(() => witness.mock.calls.length > 0)
    otherTab.close()

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('leader election', () => {
  it('is the sole leader when the Web Locks API is unavailable', () => {
    startLeaderElection()
    expect(isLeader()).toBe(true)

    const onLeader = vi.fn()
    onBecomeLeader(onLeader)
    expect(onLeader).toHaveBeenCalledTimes(1)
  })

  it('waits for the lock when Web Locks is available, then becomes leader', () => {
    const { grantNext } = stubWebLocks()
    const onLeader = vi.fn()

    startLeaderElection()
    // Presumptive leadership is handed off until the lock is actually granted.
    expect(isLeader()).toBe(false)
    onBecomeLeader(onLeader)
    expect(onLeader).not.toHaveBeenCalled()

    grantNext()
    expect(isLeader()).toBe(true)
    expect(onLeader).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — a second election request is ignored', () => {
    const { grantNext } = stubWebLocks()
    startLeaderElection()
    startLeaderElection()
    grantNext()
    expect(isLeader()).toBe(true)
    // The second request queued no extra grant, so nothing else is pending.
    expect(grantNext()).toBeUndefined()
  })
})
