import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetLocalDbForTests,
  appendOutboxOp,
  getLocalRecipe,
  listOutboxOps,
  type OutboxOp,
} from './db'
import { createRecipe, deleteRecipe, updateRecipe } from './mutations'
import { __resetOutboxSyncForTests, drainOutbox } from './outboxSync'

type FetchMock = ReturnType<typeof vi.fn>
let fetchMock: FetchMock

/** Minimal Response-like for the sync client (uses ok/status/text only). */
function res(status: number, body = ''): Partial<Response> {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

function op(overrides: Partial<OutboxOp> = {}): OutboxOp {
  return {
    opId: `op-${Math.random()}`,
    entity: 'recipe',
    type: 'create',
    key: 'r1',
    payload: { name: 'Soup' },
    createdAt: 1,
    attempts: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  __resetOutboxSyncForTests()
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  __resetOutboxSyncForTests()
  vi.unstubAllGlobals()
})

describe('drainOutbox — success paths', () => {
  it('sends a create with the client id and idempotency header, then clears it', async () => {
    fetchMock.mockResolvedValue(res(201, '{}'))
    await appendOutboxOp(op({ opId: 'c1', type: 'create', key: 'r1', payload: { name: 'Soup' } }))

    await drainOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/recipes')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Client-Op-Id']).toBe('c1')
    expect(JSON.parse(init.body)).toEqual({ id: 'r1', name: 'Soup' })
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('sends an update as PUT to the recipe id', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'))
    await appendOutboxOp(op({ type: 'update', key: 'r7', payload: { name: 'New' } }))

    await drainOutbox()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/recipes/r7')
    expect(init.method).toBe('PUT')
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('treats a 404 on delete as idempotent success', async () => {
    fetchMock.mockResolvedValue(res(404, 'not found'))
    await appendOutboxOp(op({ type: 'delete', key: 'gone', payload: undefined }))

    await drainOutbox()

    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('drains multiple ops in FIFO order', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'))
    await appendOutboxOp(op({ opId: 'a', type: 'create', key: 'r1' }))
    await appendOutboxOp(op({ opId: 'b', type: 'update', key: 'r1', payload: { name: 'Edited' } }))

    await drainOutbox()

    expect(fetchMock.mock.calls[0][1].headers['X-Client-Op-Id']).toBe('a')
    expect(fetchMock.mock.calls[1][1].headers['X-Client-Op-Id']).toBe('b')
    expect(await listOutboxOps()).toHaveLength(0)
  })
})

describe('drainOutbox — failure handling', () => {
  it('keeps the op queued and stops when the network is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed to fetch'))
    await appendOutboxOp(op({ opId: 'a', key: 'r1' }))
    await appendOutboxOp(op({ opId: 'b', key: 'r2' }))

    await drainOutbox()

    // First op failed transiently → whole queue waits; nothing removed.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const ops = await listOutboxOps()
    expect(ops).toHaveLength(2)
    expect(ops[0].attempts).toBe(1)
    expect(ops[0].parkedAt).toBeUndefined()
  })

  it('stops the queue on 401 without navigating (offline-first guarantee)', async () => {
    fetchMock.mockResolvedValue(res(401, 'unauthorized'))
    await appendOutboxOp(op({ opId: 'a', key: 'r1' }))

    await drainOutbox()

    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0].parkedAt).toBeUndefined()
  })

  it('parks a permanent 4xx and keeps draining other entities', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/r1') || url === '/api/recipes' ? res(400, 'bad') : res(200)),
    )
    // Two entities: r1's create is rejected (400) and parked; r2's update succeeds.
    await appendOutboxOp(op({ opId: 'a', type: 'update', key: 'r1', payload: { name: 'x' } }))
    await appendOutboxOp(op({ opId: 'b', type: 'update', key: 'r2', payload: { name: 'y' } }))

    await drainOutbox()

    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0].opId).toBe('a')
    expect(ops[0].parkedAt).toBeGreaterThan(0)
    expect(ops[0].lastError).toBe('bad')
  })

  it('does not advance past a blocked key (create parked → its update held)', async () => {
    fetchMock.mockResolvedValue(res(400, 'bad'))
    await appendOutboxOp(op({ opId: 'create', type: 'create', key: 'r1', payload: { name: 'x' } }))
    await appendOutboxOp(op({ opId: 'update', type: 'update', key: 'r1', payload: { name: 'y' } }))

    await drainOutbox()

    // The create is parked; the later update for the same key is not attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const ops = await listOutboxOps()
    expect(ops.find((o) => o.opId === 'create')?.parkedAt).toBeGreaterThan(0)
    expect(ops.find((o) => o.opId === 'update')?.parkedAt).toBeUndefined()
  })
})

describe('optimistic recipe mutations', () => {
  it('createRecipe writes locally and queues a create op with a minted id', async () => {
    // Offline so the kicked drain leaves the op queued (deterministic assertion).
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const recipe = await createRecipe({
      name: 'Chili',
      description: '',
      sourceUrl: null,
      sourceName: null,
      ingredients: [],
      steps: [],
      servings: 4,
      tags: [],
    })

    expect(recipe.id).toBeTruthy()
    expect((await getLocalRecipe(recipe.id))?.doc.name).toBe('Chili')
    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'recipe', type: 'create', key: recipe.id })
  })

  it('updateRecipe overwrites the local doc and queues an update op', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await updateRecipe('r1', {
      name: 'Renamed',
      description: '',
      sourceUrl: null,
      sourceName: null,
      ingredients: [],
      steps: [],
      servings: 4,
      tags: [],
    })

    expect((await getLocalRecipe('r1'))?.doc.name).toBe('Renamed')
    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'recipe', type: 'update', key: 'r1' })
  })

  it('deleteRecipe removes locally and queues a delete op', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await appendOutboxOp(op()) // unrelated existing op to prove we append, not replace
    await deleteRecipe('r1')

    expect(await getLocalRecipe('r1')).toBeNull()
    const ops = await listOutboxOps()
    expect(ops.some((o) => o.type === 'delete' && o.key === 'r1')).toBe(true)
  })
})
