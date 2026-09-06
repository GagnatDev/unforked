import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitFor } from '@/test/waitFor'
import { __resetSyncStatusForTests, getSyncStatus, trackSync } from './syncStatus'

beforeEach(() => __resetSyncStatusForTests())
afterEach(() => { __resetSyncStatusForTests(); vi.restoreAllMocks() })

it('reports online transport failures, retained until the same pull succeeds', async () => {
  await expect(trackSync('recipes', async () => { throw new TypeError('Failed to fetch') })).rejects.toThrow()
  expect(getSyncStatus().failure).toBe('transport')
  await trackSync('outbox', async () => {})
  await trackSync('mealPlan:2026-W01', async () => {})
  expect(getSyncStatus().failure).toBe('transport')
  await trackSync('recipes', async () => {})
  expect(getSyncStatus().failure).toBeNull()
})

it('reflects running work without prematurely clearing its last failure', async () => {
  await expect(trackSync('recipes', async () => { throw Object.assign(new Error('expired'), { status: 401 }) })).rejects.toThrow()
  let finish!: () => void
  const running = trackSync('recipes', () => new Promise<void>(resolve => { finish = resolve }))
  expect(getSyncStatus()).toMatchObject({ active: true, failure: 'auth' })
  finish()
  await running
  expect(getSyncStatus()).toMatchObject({ active: false, failure: null })
})

it('does not let another tab complete a still-running same-key pull', async () => {
  let finish!: () => void
  const local = trackSync('recipes', () => new Promise<void>(resolve => { finish = resolve }))
  const other = new BroadcastChannel('unforked-cross-tab')
  try {
    other.postMessage({ kind: 'sync-outcome', sourceId: 'other', key: 'recipes', runId: 'other-run', outcome: { active: true, failure: null } })
    other.postMessage({ kind: 'sync-outcome', sourceId: 'other', key: 'recipes', runId: 'other-run', outcome: { active: false, failure: 'http' } })
    await waitFor(() => getSyncStatus().failure === 'http')
    expect(getSyncStatus().active).toBe(true)
    finish()
    await local
    expect(getSyncStatus()).toMatchObject({ active: false, failure: null })
  } finally { other.close() }
})

it('expires a crashed source, renews live sources, and allows same-key retry recovery', async () => {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const intervals = vi.spyOn(globalThis, 'setInterval')
  await trackSync('initial', async () => {})
  const other = new BroadcastChannel('unforked-cross-tab')
  try {
    other.postMessage({ kind: 'sync-outcome', sourceId: 'dead', key: 'recipes', runId: 'dead-run', outcome: { active: true, failure: null } })
    await waitFor(() => getSyncStatus().active)
    now += 120_000
    for (const [tick] of intervals.mock.calls) (tick as () => void)()
    expect(getSyncStatus()).toEqual({ active: false, failure: 'transport' })
    const { getObservedPullKeys } = await import('./sync')
    expect(getObservedPullKeys()).toContain('recipes')
    await trackSync('recipes', async () => {})
    expect(getSyncStatus().failure).toBeNull()
    other.postMessage({ kind: 'sync-outcome', sourceId: 'live', key: 'recipes', runId: 'live-run', outcome: { active: true, failure: null } })
    await waitFor(() => getSyncStatus().active)
    now += 80_000
    other.postMessage({ kind: 'sync-heartbeat', sourceId: 'live' })
    // A subsequent terminal message acts as a channel delivery barrier.
    other.postMessage({ kind: 'sync-outcome', sourceId: 'barrier-source', key: 'barrier', runId: 'barrier', outcome: { active: false, failure: 'http' } })
    await waitFor(() => getSyncStatus().failure === 'http')
    now += 40_000
    for (const [tick] of intervals.mock.calls) (tick as () => void)()
    expect(getSyncStatus().active).toBe(true)
    now += 120_000
    for (const [tick] of intervals.mock.calls) (tick as () => void)()
    expect(getSyncStatus().active).toBe(false)
  } finally { other.close() }
})

it('heartbeats only its own active work with the same source identity', async () => {
  const intervals = vi.spyOn(globalThis, 'setInterval')
  const other = new BroadcastChannel('unforked-cross-tab')
  const messages: import('./crossTab').CrossTabMessage[] = []
  other.onmessage = event => messages.push(event.data)
  let finish!: () => void
  const run = trackSync('recipes', () => new Promise<void>(resolve => { finish = resolve }))
  try {
    await waitFor(() => messages.some(message => message.kind === 'sync-outcome'))
    for (const [tick] of intervals.mock.calls) (tick as () => void)()
    await waitFor(() => messages.some(message => message.kind === 'sync-heartbeat'))
    const start = messages.find(message => message.kind === 'sync-outcome')!
    const heartbeat = messages.find(message => message.kind === 'sync-heartbeat')!
    expect(heartbeat).toMatchObject({ sourceId: (start as { sourceId: string }).sourceId })
    finish()
    await run
    await waitFor(() => messages.some(message => message.kind === 'sync-outcome' && !message.outcome.active))
    const count = messages.filter(message => message.kind === 'sync-heartbeat').length
    for (const [tick] of intervals.mock.calls) (tick as () => void)()
    expect(messages.filter(message => message.kind === 'sync-heartbeat')).toHaveLength(count)
  } finally { finish(); await run; other.close() }
})

it('requests a startup snapshot and imports existing remote failures and active work', async () => {
  const other = new BroadcastChannel('unforked-cross-tab')
  other.onmessage = event => {
    if (event.data.kind === 'sync-status-request') other.postMessage({
      kind: 'sync-status-snapshot', target: event.data.sourceId,
      outcomes: [['shopping:week', 'auth']],
      runs: [{ key: 'shopping:week', runId: 'remote-startup', sourceId: 'leader' }],
    })
  }
  try {
    await trackSync('initial', async () => {})
    await waitFor(() => getSyncStatus().failure === 'auth')
    expect(getSyncStatus().active).toBe(true)
    other.postMessage({ kind: 'sync-outcome', sourceId: 'leader', key: 'shopping:week', runId: 'remote-startup', outcome: { active: false, failure: null } })
    await waitFor(() => !getSyncStatus().active)
    expect(getSyncStatus().failure).toBeNull()
  } finally { other.close() }
})

it('coalesces same-key pulls', async () => {
  let finish!: () => void
  const pull = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const first = trackSync('recipes', pull)
  const second = trackSync('recipes', pull)
  expect(pull).toHaveBeenCalledTimes(1)
  finish()
  await Promise.all([first, second])
})
