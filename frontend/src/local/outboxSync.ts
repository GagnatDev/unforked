import type { MealPlanDoc, RecipeDoc } from '@/types'

import {
  deleteOutboxOp,
  listOutboxOps,
  type MealPlanOpPayload,
  type OutboxOp,
  putOutboxOp,
  type RecipeUpdatePayload,
  type ShoppingItemCreatePayload,
  type ShoppingItemUpdatePayload,
} from './db'
import { mergeMealPlan } from './mealPlanMerge'
import { mergeRecipe } from './recipeMerge'

/**
 * How many times a single op re-fetches the current version and retries after
 * a `409` before it is left blocked for the next drain (offline-first A5).
 */
const MAX_CONFLICT_RETRIES = 3

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

function headers(op: OutboxOp): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // Idempotency key so a reload mid-flush cannot double-apply on replay.
    'X-Client-Op-Id': op.opId,
  }
}

function weekQuery(weekId: string): string {
  return `?week=${encodeURIComponent(weekId)}`
}

/**
 * Classify a failed (non-2xx) response into a retry disposition, shared by all
 * entities. 401/5xx are transient (queue-wide wait); 409 blocks just this key
 * (phase-4 resolution); other 4xx are permanent (park). Never navigates.
 */
function classifyFailure(status: number, body: string): SendResult {
  if (status === 401) return { ok: false, retry: 'queue', message: 'session expired' }
  if (status === 409) return { ok: false, retry: 'key', message: 'conflict' }
  if (status >= 500) return { ok: false, retry: 'queue', message: `server error ${status}` }
  return { ok: false, retry: 'park', message: body || `HTTP ${status}` }
}

// --- recipe ops ---

async function sendRecipeOp(op: OutboxOp): Promise<SendResult> {
  if (op.type === 'update') return sendRecipeUpdate(op)

  const url = op.type === 'create' ? `${base}/api/recipes` : `${base}/api/recipes/${op.key}`
  const init: RequestInit =
    op.type === 'create'
      ? {
          method: 'POST',
          headers: headers(op),
          body: JSON.stringify({ id: op.key, ...(op.payload as RecipeDoc) }),
        }
      : { method: 'DELETE', headers: headers(op) }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    return { ok: false, retry: 'queue', message: 'network unreachable' }
  }
  if (res.ok) return { ok: true }
  // Deleting something the server no longer has is a no-op success (idempotent).
  if (op.type === 'delete' && res.status === 404) return { ok: true }
  return classifyFailure(res.status, await res.text().catch(() => ''))
}

/**
 * PUT a recipe edit under optimistic concurrency. Sends our `baseVersion`; on a
 * `409` the server returns its current doc + version, we field-merge our changes
 * onto it (`mergeRecipe`) and retry with the fresh version. A `404` means the
 * recipe is gone server-side, so the update is a no-op success.
 */
async function sendRecipeUpdate(op: OutboxOp): Promise<SendResult> {
  const { baseDoc, nextDoc } = op.payload as RecipeUpdatePayload
  const url = `${base}/api/recipes/${op.key}`
  let doc = nextDoc
  let baseVersion = op.baseVersion

  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    const body = baseVersion === undefined ? doc : { ...doc, baseVersion }
    let res: Response
    try {
      res = await fetch(url, { method: 'PUT', headers: headers(op), body: JSON.stringify(body) })
    } catch {
      return { ok: false, retry: 'queue', message: 'network unreachable' }
    }
    if (res.ok) return { ok: true }
    if (res.status === 404) return { ok: true }
    if (res.status === 409) {
      const conflict = (await res.json().catch(() => null)) as
        | { doc?: RecipeDoc; version?: number }
        | null
      if (!conflict?.doc || conflict.version === undefined) break
      // Re-merge our original edit onto the server's current doc, not the
      // previously-merged one, so our intent stays relative to `baseDoc`.
      doc = mergeRecipe(baseDoc, nextDoc, conflict.doc)
      baseVersion = conflict.version
      continue
    }
    return classifyFailure(res.status, await res.text().catch(() => ''))
  }
  return { ok: false, retry: 'key', message: 'conflict' }
}

// --- meal-plan ops (whole-doc PUT with a day-level merge onto the server doc) ---

const EMPTY_PLAN = (weekId: string): MealPlanDoc => ({
  weekIdentifier: weekId,
  defaultPersons: null,
  assignments: [],
})

/**
 * Push one meal-plan edit under optimistic concurrency. Re-reads the server's
 * current plan (and its version), re-applies only our changed days onto it
 * (so a co-editor's other-day edits survive), then PUTs the merged doc with the
 * server's version as `baseVersion`. On a `409` (someone wrote between our GET
 * and PUT) we simply re-run the GET+merge against the now-current doc and retry;
 * `mergeMealPlan` is idempotent, so this converges. The reconciled state reaches
 * the local store on the next background pull.
 */
async function sendMealPlanOp(op: OutboxOp): Promise<SendResult> {
  const { baseDoc, nextDoc } = op.payload as MealPlanOpPayload
  const weekId = op.key
  const url = `${base}/api/meal-plans/current${weekQuery(weekId)}`

  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    let getRes: Response
    try {
      getRes = await fetch(url, { headers: headers(op) })
    } catch {
      return { ok: false, retry: 'queue', message: 'network unreachable' }
    }
    if (!getRes.ok) return classifyFailure(getRes.status, await getRes.text().catch(() => ''))
    const server: MealPlanDoc & { version?: number } =
      ((await getRes.json().catch(() => null)) as (MealPlanDoc & { version?: number }) | null) ??
      EMPTY_PLAN(weekId)

    const merged = mergeMealPlan(baseDoc, nextDoc, server, weekId)
    const body =
      server.version === undefined ? merged : { ...merged, baseVersion: server.version }

    let putRes: Response
    try {
      putRes = await fetch(url, { method: 'PUT', headers: headers(op), body: JSON.stringify(body) })
    } catch {
      return { ok: false, retry: 'queue', message: 'network unreachable' }
    }
    if (putRes.ok) return { ok: true }
    if (putRes.status === 409) continue
    return classifyFailure(putRes.status, await putRes.text().catch(() => ''))
  }
  return { ok: false, retry: 'key', message: 'conflict' }
}

// --- shopping-item ops (per-item create/update/delete) ---

/**
 * Best-known list version per week, learned across a drain from PATCH results
 * and `409` bodies. Lets a batch of stale-based PATCHes converge on the current
 * version without a 409 on every op. Stale entries only ever cost one extra
 * `409` recovery, so it never needs clearing.
 */
const shoppingVersions = new Map<string, number>()

/** Create / delete: idempotent by item id, so no version precondition applies. */
function shoppingItemInit(op: OutboxOp): { url: string; init: RequestInit } {
  if (op.type === 'create') {
    const { weekId, item } = op.payload as ShoppingItemCreatePayload
    return {
      url: `${base}/api/shopping-lists/items${weekQuery(weekId)}`,
      init: {
        method: 'POST',
        headers: headers(op),
        // The client mints the id; category is omitted so the server
        // (re-)categorizes with its own heuristic + family overrides on sync.
        body: JSON.stringify({
          id: op.key,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }),
      },
    }
  }
  const { weekId } = op.payload as { weekId: string }
  return {
    url: `${base}/api/shopping-lists/items/${op.key}${weekQuery(weekId)}`,
    init: { method: 'DELETE', headers: headers(op) },
  }
}

async function sendShoppingItemOp(op: OutboxOp): Promise<SendResult> {
  if (op.type === 'update') return sendShoppingItemPatch(op)

  const { url, init } = shoppingItemInit(op)
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    return { ok: false, retry: 'queue', message: 'network unreachable' }
  }
  if (res.ok) return { ok: true }
  // A 404 on delete means the item is already gone server-side — the client's
  // intent is satisfied, so treat it as an idempotent success.
  if (op.type === 'delete' && res.status === 404) return { ok: true }
  return classifyFailure(res.status, await res.text().catch(() => ''))
}

/**
 * PATCH one shopping-list item under optimistic concurrency (offline-first A5).
 * Sends the list's `baseVersion`; on a `409` (a concurrent item edit bumped the
 * list) the server returns its current version, and we re-send the same
 * single-field patch against it — item-targeted, so a co-editor's other-item
 * change is never clobbered. A `404` means the item is gone (idempotent success).
 */
async function sendShoppingItemPatch(op: OutboxOp): Promise<SendResult> {
  const { weekId, patch } = op.payload as ShoppingItemUpdatePayload
  const url = `${base}/api/shopping-lists/items/${op.key}${weekQuery(weekId)}`
  let baseVersion = shoppingVersions.get(weekId) ?? op.baseVersion

  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    const body = baseVersion === undefined ? patch : { ...patch, baseVersion }
    let res: Response
    try {
      res = await fetch(url, { method: 'PATCH', headers: headers(op), body: JSON.stringify(body) })
    } catch {
      return { ok: false, retry: 'queue', message: 'network unreachable' }
    }
    if (res.ok) {
      // The server bumps the list version by exactly one on a matching PATCH.
      if (baseVersion !== undefined) shoppingVersions.set(weekId, baseVersion + 1)
      return { ok: true }
    }
    if (res.status === 404) return { ok: true }
    if (res.status === 409) {
      const conflict = (await res.json().catch(() => null)) as { version?: number } | null
      if (conflict?.version === undefined) break
      baseVersion = conflict.version
      shoppingVersions.set(weekId, baseVersion)
      continue
    }
    return classifyFailure(res.status, await res.text().catch(() => ''))
  }
  return { ok: false, retry: 'key', message: 'conflict' }
}

async function sendOp(op: OutboxOp): Promise<SendResult> {
  switch (op.entity) {
    case 'recipe':
      return sendRecipeOp(op)
    case 'mealPlan':
      return sendMealPlanOp(op)
    case 'shoppingItem':
      return sendShoppingItemOp(op)
    default:
      return { ok: false, retry: 'park', message: `unsupported entity: ${op.entity as string}` }
  }
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
  shoppingVersions.clear()
  resetBackoff()
}
