import type { LocalStoreName } from './db'

/**
 * Cross-tab coordination for the offline-first data layer (spec #84, phase 6).
 *
 * Two primitives, both degrading safely to single-tab behaviour where the
 * underlying browser API is missing (older browsers, SSR, tests):
 *
 *   1. A `BroadcastChannel` message bus so a local write, an outbox kick, or a
 *      deferred-reauth change in one tab reaches every other open tab. This is
 *      what lets `useLocal` subscribers in other tabs re-render on a local
 *      write, and what lets a follower tab ask the leader to drain or re-auth.
 *   2. Leader election via the Web Locks API: exactly one open tab holds a
 *      never-released lock and is the "leader". Only the leader drives outbox
 *      draining and the re-auth navigation, so multiple tabs never double-flush
 *      the queue or race on `reloadForLogin`. When the leader's tab closes the
 *      lock frees automatically and another tab becomes the leader.
 */

/** Messages carried on the shared cross-tab channel. */
export type CrossTabMessage =
  /** A committed local write; receivers re-fire their in-tab store listeners. */
  | { kind: 'local-write'; stores: LocalStoreName[] }
  /** A follower queued a mutation and asks the leader to drain the outbox. */
  | { kind: 'outbox-kick' }
  /** A follower saw a 401 and asks the leader to drive the re-auth navigation. */
  | { kind: 'reauth-request' }
  /** The deferred-reauth ("will sync") indicator changed; mirror it everywhere. */
  | { kind: 'reauth-state'; pending: boolean }

const CHANNEL_NAME = 'unforked-cross-tab'
const LEADER_LOCK = 'unforked-sync-leader'

// --- message bus (BroadcastChannel) ---

let channel: BroadcastChannel | null = null
let channelUnavailable = false
const handlers = new Set<(message: CrossTabMessage) => void>()

function getChannel(): BroadcastChannel | null {
  if (channel || channelUnavailable) return channel
  if (typeof BroadcastChannel === 'undefined') {
    channelUnavailable = true
    return null
  }
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<CrossTabMessage>) => {
    for (const handler of handlers) handler(event.data)
  }
  return channel
}

/**
 * Broadcast a message to every *other* open tab. A `BroadcastChannel` never
 * delivers a message back to the sender, so there is no echo loop. A no-op when
 * `BroadcastChannel` is unavailable.
 */
export function postCrossTab(message: CrossTabMessage): void {
  getChannel()?.postMessage(message)
}

/** Subscribe to messages from other tabs. Returns an unsubscribe function. */
export function subscribeCrossTab(handler: (message: CrossTabMessage) => void): () => void {
  getChannel() // ensure the channel is live so messages are received from now on
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

// --- leader election (Web Locks; falls back to sole-leader) ---

let leader = true // sole-tab default until an election proves otherwise
let electionStarted = false
const leaderCallbacks = new Set<() => void>()

/** Whether this tab currently drives outbox draining and re-auth navigation. */
export function isLeader(): boolean {
  return leader
}

/**
 * Run `callback` when this tab becomes the leader. Fires immediately if it is
 * already the leader. Returns an unsubscribe function.
 */
export function onBecomeLeader(callback: () => void): () => void {
  leaderCallbacks.add(callback)
  if (leader) callback()
  return () => {
    leaderCallbacks.delete(callback)
  }
}

/**
 * Begin leader election. Idempotent. With the Web Locks API this tab requests a
 * lock held for its whole lifetime; whoever holds it is the leader, and the lock
 * frees automatically when the tab closes so another tab takes over. Without the
 * API (older browsers / tests) the tab stays the sole leader — exactly the
 * pre-phase-6 single-tab behaviour.
 */
export function startLeaderElection(): void {
  if (electionStarted) return
  electionStarted = true

  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks || typeof locks.request !== 'function') {
    if (!leader) {
      leader = true
      for (const callback of leaderCallbacks) callback()
    }
    return
  }

  // Hand off presumptive leadership and wait for the lock; whoever holds it is
  // the single leader.
  leader = false
  void locks.request(LEADER_LOCK, () => {
    leader = true
    for (const callback of leaderCallbacks) callback()
    // Never resolve: hold the lock (and leadership) until this tab is closed.
    return new Promise<never>(() => {})
  })
}

/** Test hook: reset channel + leadership so cases don't leak into each other. */
export function __resetCrossTabForTests(): void {
  channel?.close()
  channel = null
  channelUnavailable = false
  handlers.clear()
  leader = true
  electionStarted = false
  leaderCallbacks.clear()
}
