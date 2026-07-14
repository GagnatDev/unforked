import type { RecipeDoc } from '@/types'

import {
  deleteOutboxOp,
  listOutboxOps,
  type OutboxOp,
  putOutboxOp,
} from './db'

/**
 * Outbox sync engine — the push half of the offline-first sync (spec A6).
 * Drains the durable mutation queue against the server in FIFO order, one op
 * at a time, honouring per-entity ordering and classifying failures so the
 * queue is resilient to being offline, to session loss, and to reloads
 * mid-flush.
 *
 * Deliberately independent of `api.ts`: it must never call `reloadForLogin`
 * (offline-first constraint — a lost session is handled by AuthContext, not
 * here) and it needs the raw status code to decide retry vs. park.
 */

const base = import.meta.env.VITE_API_URL ?? ''

/** How a failed op affects the drain. */
type SendResult =
  | { ok: true }
  /** Network unreachable / server down / 401: whole queue waits and retries. */
  | { ok: false; retry: 'queue'; message: string }
  /** 409 conflict: this entity waits (phase-4 resolution), others proceed. */
  | { ok: false; retry: 'key'; message: string }
  /** Validation/permission 4xx: park this op, keep draining other entities. */
  | { ok: false; retry: 'park'; message: string }

function recipeUrl(op: OutboxOp): string {
  return op.type === 'create' ? `${base}/api/recipes` : `${base}/api/recipes/${op.key}`
}

function requestInit(op: OutboxOp): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Idempotency key so a reload mid-flush cannot double-apply on replay.
    'X-Client-Op-Id': op.opId,
  }
  if (op.type === 'delete') return { method: 'DELETE', headers }
  if (op.type === 'create') {
    return {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: op.key, ...(op.payload as RecipeDoc) }),
    }
  }
  return { method: 'PUT', headers, body: JSON.stringify(op.payload) }
}

async function sendOp(op: OutboxOp): Promise<SendResult> {
  if (op.entity !== 'recipe') {
    // Non-recipe entities are not synced until phase 3; park so they don't
    // wedge the queue if one is somehow enqueued early.
    return { ok: false, retry: 'park', message: `unsupported entity: ${op.entity}` }
  }

  let res: Response
  try {
    res = await fetch(recipeUrl(op), requestInit(op))
  } catch {
    // fetch throwing means the network is unreachable — stay offline, retry later.
    return { ok: false, retry: 'queue', message: 'network unreachable' }
  }

  if (res.ok) return { ok: true }

  // Deleting something the server no longer has is a no-op success (idempotent).
  if (op.type === 'delete' && res.status === 404) return { ok: true }

  if (res.status === 401) return { ok: false, retry: 'queue', message: 'session expired' }
  if (res.status === 409) return { ok: false, retry: 'key', message: 'conflict' }
  if (res.status >= 500) return { ok: false, retry: 'queue', message: `server error ${res.status}` }

  const text = await res.text().catch(() => '')
  return { ok: false, retry: 'park', message: text || `HTTP ${res.status}` }
}

// --- retry/backoff ---

const INITIAL_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000
let backoffMs = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRetry(): void {
  // While offline, rely on the `online` event rather than a timer that would
  // only fail the same way.
  if (retryTimer != null) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  backoffMs = backoffMs === 0 ? INITIAL_BACKOFF_MS : Math.min(backoffMs * 2, MAX_BACKOFF_MS)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void drainOutbox()
  }, backoffMs)
}

function resetBackoff(): void {
  backoffMs = 0
  if (retryTimer != null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

// --- drain loop ---

let draining = false
let rerunRequested = false

/**
 * Drain the outbox once: walk active ops in FIFO order, applying each and
 * removing it on success. Returns whether a transient failure asked us to
 * retry the whole queue later.
 */
async function drainOnce(): Promise<{ retryLater: boolean }> {
  const ops = await listOutboxOps()
  const active = ops.filter((op) => op.parkedAt == null)
  if (active.length === 0) return { retryLater: false }

  // Keys we must not advance past this round, to preserve per-entity ordering
  // (a create must precede its later update) without blocking other entities.
  const blockedKeys = new Set<string>()

  for (const op of active) {
    const keyId = `${op.entity}:${op.key}`
    if (blockedKeys.has(keyId)) continue

    const result = await sendOp(op)
    if (result.ok) {
      await deleteOutboxOp(op.seq!)
      continue
    }

    const attempted: OutboxOp = { ...op, attempts: op.attempts + 1, lastError: result.message }
    if (result.retry === 'park') {
      await putOutboxOp({ ...attempted, parkedAt: Date.now() })
      blockedKeys.add(keyId)
      continue
    }
    if (result.retry === 'key') {
      await putOutboxOp(attempted)
      blockedKeys.add(keyId)
      continue
    }
    // 'queue' — network/session-wide problem; record the attempt and stop.
    await putOutboxOp(attempted)
    return { retryLater: true }
  }

  return { retryLater: false }
}

/**
 * Drain the outbox, coalescing concurrent callers into a single loop and
 * re-running once more if a mutation was kicked while a drain was in flight.
 */
export async function drainOutbox(): Promise<void> {
  if (draining) {
    rerunRequested = true
    return
  }
  draining = true
  try {
    let retryLater = false
    do {
      rerunRequested = false
      retryLater = (await drainOnce()).retryLater
    } while (rerunRequested)
    if (retryLater) scheduleRetry()
    else resetBackoff()
  } catch {
    // A store read/write failed unexpectedly — try again on the next trigger.
    scheduleRetry()
  } finally {
    draining = false
  }
}

/** Fire-and-forget drain, e.g. right after appending a mutation. */
export function kickOutboxSync(): void {
  void drainOutbox()
}

// --- lifecycle / triggers ---

let started = false

/**
 * Register drain triggers and flush anything that survived a reload. Idempotent
 * so it is safe to call once at app startup.
 */
export function startOutboxSync(): void {
  if (started || typeof window === 'undefined') return
  started = true

  const onOnline = () => {
    resetBackoff()
    void drainOutbox()
  }
  const onFocus = () => {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) void drainOutbox()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFocus()
  })

  // Drain ops persisted from a previous session (offline edit → reload).
  void drainOutbox()
}

/** Test hook: clear the module-level drain/backoff state between cases. */
export function __resetOutboxSyncForTests(): void {
  draining = false
  rerunRequested = false
  started = false
  resetBackoff()
}
