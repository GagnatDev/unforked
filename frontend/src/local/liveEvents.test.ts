import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentWeekId, getNextWeekId } from '@/lib/utils'

import { __resetCrossTabForTests, startLeaderElection } from './crossTab'
import { __resetLocalDbForTests, appendOutboxOp, putLocalShoppingList } from './db'
import {
  __resetLiveEventsForTests,
  noteShoppingFlush,
  setLiveEventsUser,
  startLiveEvents,
  type ShoppingListChangeEvent,
} from './liveEvents'
import { __resetOutboxSyncForTests, drainOutbox } from './outboxSync'

const pullShoppingListMock = vi.hoisted(() => vi.fn())
vi.mock('./sync', () => ({ pullShoppingList: pullShoppingListMock }))

const requestReauthMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/reauth', () => ({ requestReauth: requestReauthMock }))

/**
 * Scriptable `EventSource` double: tests drive `open()`, `emit()` (named SSE
 * events) and `fail()` (transient CONNECTING error vs. terminal CLOSED).
 */
class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []

  url: string
  readyState: number = MockEventSource.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
  }

  open(): void {
    this.readyState = MockEventSource.OPEN
    this.onopen?.()
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent)
    }
  }

  fail(options: { terminal?: boolean } = {}): void {
    this.readyState = options.terminal ? MockEventSource.CLOSED : MockEventSource.CONNECTING
    this.onerror?.()
  }
}

type FetchMock = ReturnType<typeof vi.fn>
let fetchMock: FetchMock

/** Minimal Response-like for the outbox sync client (ok/status/text/json). */
function res(status: number, body = ''): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body || 'null'),
  }
}

const WEEK = '2030-W10'

function eventJson(overrides: Partial<ShoppingListChangeEvent> = {}): string {
  return JSON.stringify({
    id: 'evt-1',
    type: 'shopping-list.changed',
    familyId: 'f1',
    week: WEEK,
    version: 5,
    actor: { kind: 'user', id: 'peer', label: 'peer@example.com' },
    ts: '2030-03-04T00:00:00.000Z',
    ...overrides,
  })
}

/** Boot the client as an authenticated leader and return its stream. */
function startAsLeader(userId = 'me'): MockEventSource {
  startLiveEvents()
  setLiveEventsUser(userId)
  expect(MockEventSource.instances).toHaveLength(1)
  return MockEventSource.instances[0]
}

/** Let queued microtasks / zero-delay timers (IndexedDB reads, pulls) settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  __resetLiveEventsForTests()
  __resetOutboxSyncForTests()
  __resetCrossTabForTests()
  globalThis.indexedDB = new IDBFactory()
  MockEventSource.instances = []
  vi.stubGlobal('EventSource', MockEventSource)
  fetchMock = vi.fn().mockResolvedValue(res(200))
  vi.stubGlobal('fetch', fetchMock)
  pullShoppingListMock.mockReset().mockResolvedValue(undefined)
  requestReauthMock.mockReset().mockResolvedValue('deferred')
})

afterEach(() => {
  __resetLiveEventsForTests()
  __resetOutboxSyncForTests()
  __resetCrossTabForTests()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  Reflect.deleteProperty(document, 'visibilityState')
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('connection lifecycle', () => {
  it('opens a single stream to /api/events once authenticated as the leader', () => {
    startLiveEvents()
    expect(MockEventSource.instances).toHaveLength(0) // no identity yet

    setLiveEventsUser('me')
    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toBe('/api/events')

    setLiveEventsUser('me') // re-confirmed identity must not open a second stream
    expect(MockEventSource.instances).toHaveLength(1)
  })

  it('closes the stream when the user signs out', () => {
    const es = startAsLeader()

    setLiveEventsUser(null)

    expect(es.readyState).toBe(MockEventSource.CLOSED)
  })

  it('never connects in a follower tab; connects on leadership handover', () => {
    let grantLeadership: (() => void) | null = null
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, cb: () => Promise<never>) => {
          grantLeadership = () => void cb()
          return Promise.resolve()
        },
      },
    })
    startLeaderElection() // presumptive leadership handed to the lock holder

    startLiveEvents()
    setLiveEventsUser('me')
    expect(MockEventSource.instances).toHaveLength(0)

    // The previous leader's tab closes: the lock grants and this tab takes over.
    grantLeadership!()
    expect(MockEventSource.instances).toHaveLength(1)
  })

  it('disconnects on pagehide and reconnects on pageshow', () => {
    const es = startAsLeader()

    window.dispatchEvent(new Event('pagehide'))
    expect(es.readyState).toBe(MockEventSource.CLOSED)

    window.dispatchEvent(new Event('pageshow'))
    expect(MockEventSource.instances).toHaveLength(2)
  })

  it('defers connecting while hidden and connects when the tab becomes visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    startLiveEvents()
    setLiveEventsUser('me')
    expect(MockEventSource.instances).toHaveLength(0)

    setVisibility('visible')
    expect(MockEventSource.instances).toHaveLength(1)
  })

  it('keeps an open stream when the tab merely goes hidden', () => {
    const es = startAsLeader()

    setVisibility('hidden')

    expect(es.readyState).not.toBe(MockEventSource.CLOSED)
    expect(MockEventSource.instances).toHaveLength(1)
  })
})

describe('catch-up on stream open', () => {
  it('pulls the active shopping week on open (initial and reconnect)', async () => {
    const es = startAsLeader()

    es.open()
    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(getNextWeekId()))

    // Reconnect: EventSource retried by itself and reopened — pull fresh again.
    pullShoppingListMock.mockClear()
    es.fail()
    es.open()
    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(getNextWeekId()))
  })

  it('also refreshes locally cached current/future weeks, not past ones', async () => {
    const current = getCurrentWeekId()
    await putLocalShoppingList('2020-W01', { weekIdentifier: '2020-W01', items: [] })
    await putLocalShoppingList(current, { weekIdentifier: current, items: [] })
    const es = startAsLeader()

    es.open()

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(current))
    expect(pullShoppingListMock).toHaveBeenCalledWith(getNextWeekId())
    expect(pullShoppingListMock).not.toHaveBeenCalledWith('2020-W01')
  })
})

describe('event gating (own-write echoes vs. remote changes)', () => {
  beforeEach(async () => {
    await putLocalShoppingList(WEEK, { weekIdentifier: WEEK, items: [], version: 5 })
  })

  it('pulls on a same-version change from another member (adds/deletes do not bump)', async () => {
    const es = startAsLeader('me')

    es.emit('shopping-list.changed', eventJson({ version: 5 }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('pulls on a machine (Aivo) change', async () => {
    const es = startAsLeader('me')

    es.emit('shopping-list.changed', eventJson({ actor: { kind: 'machine', id: 'key-1', label: 'Aivo' } }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('pulls on a shopping-list.status event through the same path', async () => {
    const es = startAsLeader('me')

    es.emit('shopping-list.status', eventJson({ type: 'shopping-list.status', version: 6 }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('pulls on a newer version even when our own user is the actor (other device)', async () => {
    const es = startAsLeader('me')

    es.emit('shopping-list.changed', eventJson({ version: 6, actor: { kind: 'user', id: 'me' } }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('pulls on an actor-matching event without a recent local flush (other device)', async () => {
    const es = startAsLeader('me')

    es.emit('shopping-list.changed', eventJson({ version: 5, actor: { kind: 'user', id: 'me' } }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('skips the echo of an own add/delete: same actor, recent flush, no newer version', async () => {
    const es = startAsLeader('me')
    noteShoppingFlush(WEEK)

    es.emit('shopping-list.changed', eventJson({ version: 5, actor: { kind: 'user', id: 'me' } }))
    await settle()

    expect(pullShoppingListMock).not.toHaveBeenCalled()
  })

  it('skips the echo of an own PATCH via the flushed version, then pulls newer changes', async () => {
    const es = startAsLeader('me')
    noteShoppingFlush(WEEK, 6) // our PATCH bumped the list to 6

    es.emit('shopping-list.changed', eventJson({ version: 6, actor: { kind: 'user', id: 'me' } }))
    await settle()
    expect(pullShoppingListMock).not.toHaveBeenCalled()

    es.emit('shopping-list.changed', eventJson({ version: 7 }))
    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('stops treating actor-matching events as echoes once the flush window has passed', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const es = startAsLeader('me')
    noteShoppingFlush(WEEK)

    nowSpy.mockReturnValue(1_000_000 + 60_000)
    es.emit('shopping-list.changed', eventJson({ version: 5, actor: { kind: 'user', id: 'me' } }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it('pulls for a week with no local doc (nothing known to gate on)', async () => {
    const es = startAsLeader('me')
    noteShoppingFlush('2031-W01')

    es.emit('shopping-list.changed', eventJson({ week: '2031-W01', version: 1, actor: { kind: 'user', id: 'me' } }))

    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith('2031-W01'))
  })

  it('ignores malformed event payloads', async () => {
    const es = startAsLeader('me')

    es.emit('shopping-list.changed', 'not json')
    es.emit('shopping-list.changed', JSON.stringify({ foo: 1 }))
    await settle()

    expect(pullShoppingListMock).not.toHaveBeenCalled()
  })

  it('coalesces an event burst into the running pull plus one trailing re-pull', async () => {
    const es = startAsLeader('me')
    const resolvers: Array<() => void> = []
    pullShoppingListMock.mockImplementation(
      () => new Promise<void>((resolve) => resolvers.push(resolve)),
    )

    es.emit('shopping-list.changed', eventJson({ version: 6 }))
    es.emit('shopping-list.changed', eventJson({ version: 7 }))
    es.emit('shopping-list.changed', eventJson({ version: 8 }))
    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledTimes(1))

    resolvers[0]()
    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledTimes(2))
    resolvers[1]()
    await settle()
    expect(pullShoppingListMock).toHaveBeenCalledTimes(2)
  })
})

describe('integration with the outbox drain (real flush notes)', () => {
  it("skips our own drained PATCH's echo but pulls a peer's same-version change", async () => {
    await putLocalShoppingList(WEEK, { weekIdentifier: WEEK, items: [], version: 5 })
    const es = startAsLeader('me')
    fetchMock.mockResolvedValue(res(200, '{}'))
    await appendOutboxOp({
      opId: 'op-1',
      entity: 'shoppingItem',
      type: 'update',
      key: 'i1',
      payload: { weekId: WEEK, patch: { checked: true } },
      baseVersion: 5,
      createdAt: 1,
      attempts: 0,
    })
    await drainOutbox() // notes the flush (version 6) for the echo gate

    es.emit('shopping-list.changed', eventJson({ version: 6, actor: { kind: 'user', id: 'me' } }))
    await settle()
    expect(pullShoppingListMock).not.toHaveBeenCalled()

    es.emit('shopping-list.changed', eventJson({ version: 6, actor: { kind: 'user', id: 'peer' } }))
    await vi.waitFor(() => expect(pullShoppingListMock).toHaveBeenCalledWith(WEEK))
  })

  it("skips our own drained add's echo (version unchanged by adds)", async () => {
    await putLocalShoppingList(WEEK, { weekIdentifier: WEEK, items: [], version: 5 })
    const es = startAsLeader('me')
    fetchMock.mockResolvedValue(res(201, '{}'))
    await appendOutboxOp({
      opId: 'op-2',
      entity: 'shoppingItem',
      type: 'create',
      key: 'i2',
      payload: {
        weekId: WEEK,
        item: {
          id: 'i2',
          name: 'Kaffe',
          quantity: '',
          unit: '',
          recipeIds: [],
          category: 'beverages',
          checked: false,
          manual: true,
        },
      },
      createdAt: 1,
      attempts: 0,
    })
    await drainOutbox()

    es.emit('shopping-list.changed', eventJson({ version: 5, actor: { kind: 'user', id: 'me' } }))
    await settle()

    expect(pullShoppingListMock).not.toHaveBeenCalled()
  })
})

describe('failure discipline', () => {
  it('probes /api/auth/me after repeated errors and routes a 401 to the reauth classifier', async () => {
    fetchMock.mockResolvedValue(res(401))
    const es = startAsLeader()

    es.fail()
    es.fail()
    expect(fetchMock).not.toHaveBeenCalled() // below the probe threshold
    es.fail()

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/me')
      expect(requestReauthMock).toHaveBeenCalled()
    })
    // The classifier owns any navigation; one more error must not re-probe yet.
    fetchMock.mockClear()
    es.fail()
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a healthy probe answer changes nothing (server hiccup, keep retrying)', async () => {
    const es = startAsLeader()

    es.fail()
    es.fail()
    es.fail()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/me'))
    expect(requestReauthMock).not.toHaveBeenCalled()
  })

  it('an unreachable probe (offline) does nothing', async () => {
    fetchMock.mockRejectedValue(new TypeError('network unreachable'))
    const es = startAsLeader()

    es.fail()
    es.fail()
    es.fail()
    await settle()

    expect(requestReauthMock).not.toHaveBeenCalled()
  })

  it('recovers from a terminal close (which EventSource does not retry) on its own timer', () => {
    const es = startAsLeader()
    vi.useFakeTimers()

    es.fail({ terminal: true })
    expect(MockEventSource.instances).toHaveLength(1)

    vi.advanceTimersByTime(30_000)
    expect(MockEventSource.instances).toHaveLength(2)
  })
})
