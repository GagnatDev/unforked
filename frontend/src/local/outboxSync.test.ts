import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetLocalDbForTests,
  appendOutboxOp,
  getLocalMealPlan,
  getLocalRecipe,
  listOutboxOps,
  type OutboxOp,
} from './db'
import { createRecipe, deleteRecipe, saveMealPlan, updateRecipe } from './mutations'
import { __resetOutboxSyncForTests, drainOutbox } from './outboxSync'

type FetchMock = ReturnType<typeof vi.fn>
let fetchMock: FetchMock

/** Minimal Response-like for the sync client (uses ok/status/text/json). */
function res(status: number, body = ''): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body || 'null'),
  }
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

function recipeDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Recipe',
    description: '',
    sourceUrl: null,
    sourceName: null,
    ingredients: [],
    steps: [],
    servings: 4,
    tags: [],
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

  it('sends an update as PUT to the recipe id with its baseVersion', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'))
    const doc = recipeDoc({ name: 'New' })
    await appendOutboxOp(
      op({ type: 'update', key: 'r7', payload: { baseDoc: doc, nextDoc: doc }, baseVersion: 2 }),
    )

    await drainOutbox()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/recipes/r7')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body).baseVersion).toBe(2)
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

describe('drainOutbox — meal plans (day-level merge)', () => {
  const assignment = (day: string, recipeId: string) => ({
    day,
    recipeId,
    recipeName: recipeId.toUpperCase(),
    persons: null,
  })

  it('GETs the server plan, merges our changed day onto it, and PUTs the result', async () => {
    const baseDoc = { weekIdentifier: 'w', defaultPersons: null, assignments: [assignment('monday', 'a')] }
    // We added Tuesday offline.
    const nextDoc = {
      weekIdentifier: 'w',
      defaultPersons: null,
      assignments: [assignment('monday', 'a'), assignment('tuesday', 'b')],
    }
    // The server independently gained a Thursday.
    const server = {
      weekIdentifier: 'w',
      defaultPersons: null,
      assignments: [assignment('monday', 'a'), assignment('thursday', 'c')],
    }
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (!init || init.method == null) return Promise.resolve(res(200, JSON.stringify(server)))
      return Promise.resolve(res(200, '{}'))
    })
    await appendOutboxOp(op({ entity: 'mealPlan', type: 'update', key: 'w', payload: { baseDoc, nextDoc } }))

    await drainOutbox()

    const getCall = fetchMock.mock.calls.find(([, init]) => !init || init.method == null)
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(getCall![0]).toBe('/api/meal-plans/current?week=w')
    const putDays = JSON.parse(putCall![1].body).assignments.map((a: { day: string }) => a.day).sort()
    // Our Tuesday plus the server's untouched Thursday and Monday all survive.
    expect(putDays).toEqual(['monday', 'thursday', 'tuesday'])
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('keeps the op queued when the GET is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await appendOutboxOp(
      op({
        entity: 'mealPlan',
        type: 'update',
        key: 'w',
        payload: {
          baseDoc: { weekIdentifier: 'w', assignments: [] },
          nextDoc: { weekIdentifier: 'w', assignments: [] },
        },
      }),
    )

    await drainOutbox()

    expect(await listOutboxOps()).toHaveLength(1)
  })
})

describe('drainOutbox — shopping items', () => {
  const item = {
    id: 'i1',
    name: 'Kaffe',
    quantity: '',
    unit: '',
    recipeIds: [],
    category: 'beverages',
    checked: false,
    manual: true,
  }

  it('POSTs a create with the client id and omits the category (server re-categorizes)', async () => {
    fetchMock.mockResolvedValue(res(201, '{}'))
    await appendOutboxOp(
      op({ entity: 'shoppingItem', type: 'create', key: 'i1', payload: { weekId: 'w', item } }),
    )

    await drainOutbox()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/shopping-lists/items?week=w')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ id: 'i1', name: 'Kaffe', quantity: '', unit: '' })
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('PATCHes an update to the item id', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'))
    await appendOutboxOp(
      op({
        entity: 'shoppingItem',
        type: 'update',
        key: 'i1',
        payload: { weekId: 'w', patch: { checked: true } },
      }),
    )

    await drainOutbox()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/shopping-lists/items/i1?week=w')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ checked: true })
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('treats a 404 on update or delete as idempotent success', async () => {
    fetchMock.mockResolvedValue(res(404, 'not found'))
    await appendOutboxOp(
      op({ entity: 'shoppingItem', type: 'update', key: 'gone', payload: { weekId: 'w', patch: { checked: true } } }),
    )
    await appendOutboxOp(
      op({ entity: 'shoppingItem', type: 'delete', key: 'gone2', payload: { weekId: 'w' } }),
    )

    await drainOutbox()

    expect(await listOutboxOps()).toHaveLength(0)
  })
})

describe('drainOutbox — optimistic concurrency (409 resolution)', () => {
  it('field-merges a recipe on 409 and retries with the fresh version', async () => {
    const base = recipeDoc({ name: 'Old', servings: 4 })
    const ours = recipeDoc({ name: 'Renamed', servings: 4 }) // we changed the name
    const server = recipeDoc({ name: 'Old', servings: 8 }) // they changed servings
    let call = 0
    fetchMock.mockImplementation(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve(res(409, JSON.stringify({ error: 'conflict', doc: server, version: 5 })))
      }
      return Promise.resolve(res(200, '{}'))
    })
    await appendOutboxOp(
      op({ type: 'update', key: 'r1', payload: { baseDoc: base, nextDoc: ours }, baseVersion: 4 }),
    )

    await drainOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(retry.name).toBe('Renamed') // our disjoint change survives
    expect(retry.servings).toBe(8) // the server's disjoint change survives
    expect(retry.baseVersion).toBe(5) // retried against the current version
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('re-GETs and retries a meal-plan PUT on 409', async () => {
    const assignment = (day: string, recipeId: string) => ({
      day,
      recipeId,
      recipeName: recipeId.toUpperCase(),
      persons: null,
    })
    const server1 = {
      weekIdentifier: 'w',
      defaultPersons: null,
      assignments: [assignment('monday', 'a')],
      version: 1,
    }
    const server2 = { ...server1, version: 2 }
    let gets = 0
    let puts = 0
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (!init || init.method == null) {
        gets += 1
        return Promise.resolve(res(200, JSON.stringify(gets === 1 ? server1 : server2)))
      }
      puts += 1
      return Promise.resolve(puts === 1 ? res(409, JSON.stringify({ error: 'conflict' })) : res(200, '{}'))
    })
    const baseDoc = { weekIdentifier: 'w', defaultPersons: null, assignments: [] }
    const nextDoc = {
      weekIdentifier: 'w',
      defaultPersons: null,
      assignments: [assignment('tuesday', 'b')],
    }
    await appendOutboxOp(
      op({ entity: 'mealPlan', type: 'update', key: 'w', payload: { baseDoc, nextDoc } }),
    )

    await drainOutbox()

    const putCalls = fetchMock.mock.calls.filter(([, i]) => i?.method === 'PUT')
    expect(putCalls).toHaveLength(2)
    expect(JSON.parse(putCalls[0][1].body).baseVersion).toBe(1)
    expect(JSON.parse(putCalls[1][1].body).baseVersion).toBe(2)
    expect(await listOutboxOps()).toHaveLength(0)
  })

  it('sends baseVersion on a shopping PATCH and recovers from a 409', async () => {
    let call = 0
    fetchMock.mockImplementation(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve(
          res(409, JSON.stringify({ error: 'conflict', version: 7, weekIdentifier: 'w', items: [] })),
        )
      }
      return Promise.resolve(res(200, '{}'))
    })
    await appendOutboxOp(
      op({
        entity: 'shoppingItem',
        type: 'update',
        key: 'i1',
        payload: { weekId: 'w', patch: { checked: true } },
        baseVersion: 3,
      }),
    )

    await drainOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ checked: true, baseVersion: 3 })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ checked: true, baseVersion: 7 })
    expect(await listOutboxOps()).toHaveLength(0)
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

  it('saveMealPlan writes the plan locally and queues an update op carrying base + next', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const nextDoc = {
      weekIdentifier: 'w',
      defaultPersons: null,
      assignments: [{ day: 'monday', recipeId: 'a', recipeName: 'A', persons: null }],
    }
    await saveMealPlan('w', nextDoc)

    expect((await getLocalMealPlan('w'))?.assignments).toHaveLength(1)
    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'mealPlan', type: 'update', key: 'w' })
    // Base was empty (nothing local before), next is the saved doc.
    expect((ops[0].payload as { baseDoc: { assignments: unknown[] } }).baseDoc.assignments).toEqual([])
    expect((ops[0].payload as { nextDoc: typeof nextDoc }).nextDoc).toEqual(nextDoc)
  })
})
