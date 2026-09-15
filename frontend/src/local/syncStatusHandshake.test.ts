import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CrossTabMessage } from './crossTab'
import { __resetSyncStatusForTests, getSyncStatus, startSyncStatus } from './syncStatus'

const bus = vi.hoisted(() => ({
  receive: (_message: CrossTabMessage) => {},
  respond: (_message: CrossTabMessage) => {},
  post: vi.fn(),
}))
vi.mock('./crossTab', () => ({
  isLeader: () => false,
  subscribeCrossTab: (receive: typeof bus.receive) => { bus.receive = receive; return () => {} },
  postCrossTab: (message: CrossTabMessage) => { bus.post(message); bus.respond(message) },
}))
const requests = () => bus.post.mock.calls.filter(([message]) => message.kind === 'sync-status-request')
function leaderResponds() {
  bus.respond = message => {
    if (message.kind === 'sync-status-request') bus.receive({ kind: 'sync-status-snapshot', target: message.sourceId,
      outcomes: [['recipes', 'auth']], runs: [{ runId: 'remote', sourceId: 'leader', key: 'shopping:week' }] })
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  bus.post.mockClear()
  bus.respond = () => {}
})
afterEach(() => { __resetSyncStatusForTests(); vi.useRealTimers() })

it('bounds startup requests when no leader exists and cleans up retry timers', () => {
  startSyncStatus()
  vi.advanceTimersByTime(60_000)
  expect(requests().length).toBeGreaterThan(1)
  expect(requests().length).toBeLessThanOrEqual(5)
  const settled = requests().length
  vi.advanceTimersByTime(600_000)
  expect(requests()).toHaveLength(settled)
  __resetSyncStatusForTests()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['late startup', 'leadership handoff'])('recovers a missed request during %s and stops after the snapshot', scenario => {
  startSyncStatus()
  expect(requests()).toHaveLength(1)
  if (scenario === 'leadership handoff') vi.advanceTimersByTime(1_500)
  leaderResponds()
  vi.advanceTimersByTime(20_000)
  expect(getSyncStatus()).toEqual({ active: true, failure: 'auth' })
  const settled = requests().length
  vi.advanceTimersByTime(30_000)
  expect(requests()).toHaveLength(settled)
})

it('cancels a pending startup retry on reset', () => {
  startSyncStatus()
  __resetSyncStatusForTests()
  vi.advanceTimersByTime(60_000)
  expect(requests()).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})
