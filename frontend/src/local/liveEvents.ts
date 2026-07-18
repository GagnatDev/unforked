import { requestReauth } from '@/lib/reauth'
import { getCurrentWeekId, getNextWeekId } from '@/lib/utils'

import { isLeader, onBecomeLeader } from './crossTab'
import { getLocalShoppingList, listLocalShoppingListWeeks } from './db'
import { pullShoppingList } from './sync'

/**
 * Realtime live-update client (design #104, D3 — phase 2).
 *
 * The cross-tab **leader** tab (Web Locks election, `crossTab.ts`) owns a
 * single `EventSource('/api/events')` per device (resolved decision 8).
 * Server events are thin invalidation hints (resolved decision 2): on a
 * relevant one the leader re-pulls the week through the existing
 * `pullShoppingList` merge, and the resulting IndexedDB write re-renders every
 * tab via the established `useLocal` + BroadcastChannel path — followers need
 * no connection of their own.
 *
 * The channel is an optimization signal, never a data path: IndexedDB stays
 * the source of truth, writes keep going through the outbox, and losing the
 * stream degrades to today's pull-on-mount behaviour. Accordingly a stream
 * failure never navigates — repeated failures only run the auth probe so a
 * real 401 flows into the deferred-reauth classifier (offline-first A7).
 *
 * Own-write echo gating deviates deliberately from D3's plain "skip if
 * `version` ≤ locally-known" rule, per the phase-1 handoff on #105: only item
 * PATCHes bump the list row `version` — adds and deletes emit events carrying
 * the version the client already knows, so pure version gating would wrongly
 * skip re-pulls for another member's adds/deletes. Instead an event is skipped
 * only when it is provably our own echo: nothing newer than what we know
 * (version gate) AND our own user was the actor AND this device's outbox
 * flushed a shopping write for that week moments ago (`noteShoppingFlush`).
 * Anything unprovable pulls — the merge no-ops on a false positive, while a
 * false skip would hide a family member's change until the next focus pull.
 */

/** Mirror of the backend `ShoppingListEvent` wire shape (`changeEvents.ts`). */
export interface ShoppingListChangeEvent {
  id: string
  type: 'shopping-list.changed' | 'shopping-list.status'
  familyId: string
  week: string
  version: number
  actor: { kind: 'user' | 'machine'; id: string; label?: string }
  ts: string
}

const base = import.meta.env.VITE_API_URL ?? ''

/** Consecutive stream errors without an `open` before the auth probe runs. */
const AUTH_PROBE_AFTER_FAILURES = 3
/**
 * How recently this device's outbox must have flushed a shopping write for an
 * actor-matching event to count as our own echo. Flush→echo latency is
 * sub-second; the window only needs to outlive slow proxies.
 */
const OWN_ECHO_WINDOW_MS = 10_000
/**
 * Retry delay after a *terminal* stream close (a non-200 response, e.g. the
 * per-user stream cap's 429), which `EventSource` does not retry by itself.
 * Transient drops use the server's `retry:` hint via built-in reconnection.
 */
const RECONNECT_DELAY_MS = 30_000

let started = false
/** Authenticated user id, or null when signed out (no connection then). */
let userId: string | null = null
let source: EventSource | null = null
let consecutiveFailures = 0
let probing = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stopLeaderCallback: (() => void) | null = null

/** Best server version this device's own flushes have produced, per week. */
const flushedVersions = new Map<string, number>()
/** When this device's outbox last flushed a shopping write, per week. */
const lastOwnFlushAt = new Map<string, number>()
/** In-flight pull per week, coalescing event bursts into at most one trailing re-pull. */
const pullStates = new Map<string, 'running' | 'rerun'>()

/**
 * Record a successful shopping-item flush from this device's outbox (called by
 * `outboxSync`). Feeds the own-write echo gate; `version` is the list version
 * the flush produced, when known (PATCH), and advances the version gate so the
 * echo of our own PATCH is not mistaken for news.
 */
export function noteShoppingFlush(weekId: string, version?: number): void {
  lastOwnFlushAt.set(weekId, Date.now())
  if (version !== undefined) {
    const known = flushedVersions.get(weekId)
    if (known === undefined || version > known) flushedVersions.set(weekId, version)
  }
}

/**
 * Tell the client who is signed in. Called by `AuthContext` whenever the
 * identity changes: a user id opens the stream (leader + visible permitting),
 * null (signed out / session lost) closes it.
 */
export function setLiveEventsUser(id: string | null): void {
  userId = id
  evaluate()
}

/** Connect when eligible; tear down when auth or leadership is gone. */
function evaluate(): void {
  if (!started) return
  if (userId == null || !isLeader()) {
    disconnect()
    return
  }
  if (source) return
  // Connect only while visible (D3); a hidden tab waits for visibilitychange.
  // An already-open stream is kept while hidden so a backgrounded desktop
  // leader keeps feeding visible follower tabs.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  connect()
}

function connect(): void {
  if (typeof EventSource === 'undefined') return
  clearReconnectTimer()
  const es = new EventSource(`${base}/api/events`)
  source = es

  es.onopen = () => {
    if (source !== es) return
    consecutiveFailures = 0
    void catchUp()
  }

  const onChange = (event: Event): void => {
    if (source !== es) return
    handleEventData((event as MessageEvent).data)
  }
  es.addEventListener('shopping-list.changed', onChange)
  es.addEventListener('shopping-list.status', onChange)

  es.onerror = () => {
    if (source !== es) return
    consecutiveFailures += 1
    if (es.readyState === EventSource.CLOSED) {
      // Terminal close (non-200 response): EventSource gives up, so retry on
      // our own timer. Transient drops keep readyState CONNECTING and retry
      // themselves per the server's `retry:` hint.
      source = null
      scheduleReconnect()
    }
    if (consecutiveFailures >= AUTH_PROBE_AFTER_FAILURES) void probeAuth()
  }
}

function disconnect(): void {
  clearReconnectTimer()
  consecutiveFailures = 0
  source?.close()
  source = null
}

function scheduleReconnect(): void {
  if (reconnectTimer != null) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    evaluate()
  }, RECONNECT_DELAY_MS)
}

function clearReconnectTimer(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

/**
 * Repeated stream failures may mean the session died (an `EventSource` error
 * carries no status). Ask `/api/auth/me`: a 401 goes to the reauth classifier
 * — never a direct navigation from here — and anything else (offline, server
 * hiccup) is left to the stream's own retries (D3 failure discipline).
 */
async function probeAuth(): Promise<void> {
  if (probing) return
  probing = true
  consecutiveFailures = 0
  try {
    const res = await fetch(`${base}/api/auth/me`)
    if (res.status === 401) void requestReauth()
  } catch {
    // Network unreachable — offline does nothing; recovery is the stream's
    // own retries plus the existing online/focus pulls.
  } finally {
    probing = false
  }
}

/**
 * Catch-up on every stream (re)open, replacing event replay (resolved
 * decision 2): pull the app's active shopping week, plus any current/future
 * week some tab has cached locally (a handful at most — past weeks are
 * historical and not worth refreshing).
 */
async function catchUp(): Promise<void> {
  const currentWeek = getCurrentWeekId()
  const weeks = new Set<string>([getNextWeekId()])
  const localWeeks = await listLocalShoppingListWeeks().catch(() => [] as string[])
  // Zero-padded ISO week ids ("2026-W03") order lexicographically.
  for (const week of localWeeks) if (week >= currentWeek) weeks.add(week)
  await Promise.all([...weeks].map((week) => pullWeek(week)))
}

function handleEventData(data: unknown): void {
  if (typeof data !== 'string') return
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return
  }
  if (!isShoppingListChangeEvent(parsed)) return
  void applyChangeHint(parsed)
}

function isShoppingListChangeEvent(value: unknown): value is ShoppingListChangeEvent {
  if (typeof value !== 'object' || value == null) return false
  const evt = value as Partial<ShoppingListChangeEvent>
  return (
    (evt.type === 'shopping-list.changed' || evt.type === 'shopping-list.status') &&
    typeof evt.week === 'string' &&
    typeof evt.version === 'number' &&
    typeof evt.actor === 'object' &&
    evt.actor != null
  )
}

/** Re-pull the event's week unless it is provably our own write's echo. */
async function applyChangeHint(evt: ShoppingListChangeEvent): Promise<void> {
  const doc = await getLocalShoppingList(evt.week).catch(() => null)
  const known = maxDefined(doc?.version, flushedVersions.get(evt.week))
  if (known !== undefined && evt.version <= known && isOwnEcho(evt)) return
  await pullWeek(evt.week)
}

function maxDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

function isOwnEcho(evt: ShoppingListChangeEvent): boolean {
  if (evt.actor.kind !== 'user' || evt.actor.id !== userId) return false
  const flushedAt = lastOwnFlushAt.get(evt.week)
  return flushedAt !== undefined && Date.now() - flushedAt <= OWN_ECHO_WINDOW_MS
}

/**
 * Pull one week through the established sync/merge path, coalescing a burst of
 * events (e.g. a member adding several items) into the running pull plus at
 * most one trailing re-pull. Failures are swallowed: a realtime pull is a
 * best-effort refresh, recovered by the next event, focus pull, or reconnect.
 */
async function pullWeek(weekId: string): Promise<void> {
  if (pullStates.has(weekId)) {
    pullStates.set(weekId, 'rerun')
    return
  }
  try {
    do {
      pullStates.set(weekId, 'running')
      await pullShoppingList(weekId)
    } while (pullStates.get(weekId) === 'rerun')
  } catch {
    // Offline or a server hiccup — never surfaces, never navigates.
  } finally {
    pullStates.delete(weekId)
  }
}

// --- lifecycle ---

function handlePageHide(): void {
  // Be a good mobile citizen: drop the socket when the page is going away.
  // pageshow / visibilitychange / leadership handover reconnects later.
  disconnect()
}

function handlePageShow(): void {
  evaluate()
}

function handleVisibilityChange(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') evaluate()
}

/**
 * Register the connection triggers. Idempotent; call once at app startup. The
 * stream itself opens only once `setLiveEventsUser` supplies an identity and
 * this tab holds (or gains) leadership while visible.
 */
export function startLiveEvents(): void {
  if (started || typeof window === 'undefined') return
  started = true
  stopLeaderCallback = onBecomeLeader(evaluate)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  evaluate()
}

/** Test hook: close the stream and reset all module state and listeners. */
export function __resetLiveEventsForTests(): void {
  disconnect()
  started = false
  userId = null
  probing = false
  flushedVersions.clear()
  lastOwnFlushAt.clear()
  pullStates.clear()
  stopLeaderCallback?.()
  stopLeaderCallback = null
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('pageshow', handlePageShow)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}
