import { postCrossTab, subscribeCrossTab } from './crossTab'

export type SyncFailure = 'transport' | 'auth' | 'http' | 'conflict' | 'storage'
export type SyncOutcome = { active: boolean; failure: SyncFailure | null }
const outcomes = new Map<string, SyncFailure | null>()
const sourceId = crypto.randomUUID()
const HEARTBEAT_MS = 15_000
// Allow background timer throttling. Suspended tabs are treated like departed
// tabs; eventual completion or a same-key retry can clear the retryable failure.
const SOURCE_LEASE_MS = 90_000
const activeRuns = new Map<string, { key: string; sourceId: string; lastSeen: number }>()
let leaseTimer: ReturnType<typeof setInterval> | undefined
const running = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
let snapshot: SyncOutcome = { active: false, failure: null }
let unsubscribe: (() => void) | undefined

export function classifySyncError(error: unknown): SyncFailure {
  const status = (error as { status?: number } | null)?.status
  if (status === 401) return 'auth'
  if (status === 409) return 'conflict'
  if (status) return 'http'
  if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) return 'transport'
  return 'storage'
}

function publish(key: string, runId: string, outcome: SyncOutcome, broadcast = true, source: string = sourceId) {
  if (outcome.active) activeRuns.set(runId, { key, sourceId: source, lastSeen: Date.now() })
  else {
    activeRuns.delete(runId)
    outcomes.set(key, outcome.failure)
  }
  snapshot = { active: activeRuns.size > 0, failure: [...outcomes.values()].find(Boolean) ?? null }
  listeners.forEach(listener => listener())
  if (broadcast) postCrossTab({ kind: 'sync-outcome', sourceId, key, runId, outcome })
}

export function startSyncStatus(): void {
  if (unsubscribe) return
  unsubscribe = subscribeCrossTab(message => {
    if (message.kind === 'sync-outcome') publish(message.key, message.runId, message.outcome, false, message.sourceId)
    if (message.kind === 'sync-heartbeat') {
      for (const run of activeRuns.values()) {
        if (run.sourceId === message.sourceId) run.lastSeen = Date.now()
      }
    }
  })
  // Status liveness only: this does not schedule pulls or outbox retries.
  leaseTimer = setInterval(() => {
    if ([...activeRuns.values()].some(run => run.sourceId === sourceId)) {
      postCrossTab({ kind: 'sync-heartbeat', sourceId })
    }
    for (const [runId, run] of activeRuns) {
      if (run.sourceId !== sourceId && Date.now() - run.lastSeen >= SOURCE_LEASE_MS) {
        publish(run.key, runId, { active: false, failure: 'transport' }, false, run.sourceId)
      }
    }
  }, HEARTBEAT_MS)
}

export function subscribeSyncStatus(listener: () => void): () => void {
  startSyncStatus()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const getSyncStatus = () => snapshot
// Include failed remote-only keys in manual retry after their source departs.
export const getFailedSyncKeys = () => [...outcomes].filter(([, failure]) => failure).map(([key]) => key)

/** Retain each failure through unrelated successes and through retry startup. */
export function trackSync(key: string, work: () => Promise<void>): Promise<void> {
  startSyncStatus()
  const existing = running.get(key)
  if (existing) return existing
  const runId = crypto.randomUUID()
  publish(key, runId, { active: true, failure: outcomes.get(key) ?? null })
  const promise = work().then(
    () => { publish(key, runId, { active: false, failure: null }) },
    error => {
      publish(key, runId, { active: false, failure: classifySyncError(error) })
      throw error
    },
  ).finally(() => { running.delete(key) })
  running.set(key, promise)
  return promise
}

export function __resetSyncStatusForTests(): void {
  unsubscribe?.()
  unsubscribe = undefined
  clearInterval(leaseTimer)
  leaseTimer = undefined
  outcomes.clear()
  activeRuns.clear()
  running.clear()
  snapshot = { active: false, failure: null }
}
