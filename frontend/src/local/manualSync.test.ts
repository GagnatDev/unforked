import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { __resetLocalDbForTests, appendOutboxOp, beginRecipePull, applyRecipePull, getLocalRecipe, listOutboxOps, putLocalRecipe } from './db'
import type { Recipe } from '@/types'
import { createRecipe, deleteRecipe, updateRecipe } from './mutations'
import { __resetOutboxSyncForTests, drainOutbox, startOutboxSync, syncNow } from './outboxSync'
import { __resetCrossTabForTests, startLeaderElection, type CrossTabMessage } from './crossTab'
import { __resetSyncStatusForTests, getSyncStatus } from './syncStatus'
import { pullRecipes, pullRecipe, pullMealPlan } from './sync'
import { waitFor } from '@/test/waitFor'

vi.mock('@/lib/reauth', () => ({ requestReauth: vi.fn() }))
vi.mock('./liveEvents', () => ({ noteShoppingFlush: vi.fn() }))
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  await __resetLocalDbForTests()
  __resetOutboxSyncForTests()
  __resetSyncStatusForTests()
  __resetCrossTabForTests()
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  __resetOutboxSyncForTests()
  __resetSyncStatusForTests()
  __resetCrossTabForTests()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  vi.unstubAllGlobals()
})
const queue = () => appendOutboxOp({ opId: 'r', entity: 'recipe', type: 'delete', key: 'r', payload: {}, createdAt: 1, attempts: 0 })

it.each([401, 503, 403])('records actual HTTP %s drain failures and retains parked operations', async status => {
  await queue()
  fetchMock.mockResolvedValue(new Response('', { status }))
  await drainOutbox()
  expect(getSyncStatus().failure).toBe(status === 401 ? 'auth' : 'http')
  expect((await listOutboxOps()).length).toBe(1)
  if (status === 403) {
    await drainOutbox()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await listOutboxOps())[0].parkedAt).toBeTruthy()
  }
})

it('bounds an online hanging outbox request and reports transport failure', async () => {
  const controller = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  await queue()
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
  }))
  const run = drainOutbox()
  await waitFor(() => fetchMock.mock.calls.length === 1)
  expect(getSyncStatus().active).toBe(true)
  controller.abort()
  await run
  expect(getSyncStatus()).toMatchObject({ active: false, failure: 'transport' })
  vi.restoreAllMocks()
})

it('manual retry awaits an existing drain before retrying failed, unmounted pulls', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(pullRecipes()).rejects.toThrow()
  await queue()
  let finish!: (response: Response) => void
  fetchMock.mockImplementation((_url, init) => init?.method === 'DELETE'
    ? new Promise<Response>(resolve => { finish = resolve })
    : Promise.resolve(new Response('[]')))
  const drain = drainOutbox()
  await waitFor(() => !!finish)
  const manual = syncNow()
  await Promise.resolve()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== 'DELETE')).toHaveLength(1)
  finish(new Response(null, { status: 204 }))
  await Promise.all([drain, manual])
  expect(await listOutboxOps()).toHaveLength(0)
  expect(getSyncStatus()).toMatchObject({ active: false, failure: null })
})

it.each(['create', 'update', 'delete'] as const)('does not pull stale recipes over a failed queued %s', async type => {
  fetchMock.mockResolvedValue(new Response('[]'))
  await pullRecipes()
  await appendOutboxOp({ opId: 'pending', entity: 'recipe', type, key: 'pending', payload: {}, createdAt: 1, attempts: 0 })
  fetchMock.mockClear()
  fetchMock.mockResolvedValue(new Response('', { status: 503 }))
  await syncNow()
  expect(fetchMock.mock.calls.every(([, init]) => init?.method != null)).toBe(true)
  expect(await listOutboxOps()).toHaveLength(1)
})

it.each(['list', 'detail'] as const)('preserves mid-GET queued and parked recipe writes on a manual %s pull', async scope => {
  const server: Recipe = { id: 'race', doc: { name: 'Server', description: '', sourceUrl: null, sourceName: null, servings: 2, tags: [], ingredients: [], steps: [] } }
  fetchMock.mockResolvedValue(new Response(JSON.stringify(scope === 'list' ? [server] : server)))
  if (scope === 'list') await pullRecipes()
  else await pullRecipe(server.id)
  for (const parked of [false, true]) {
    for (const type of ['create', 'update', 'delete'] as const) {
      // A separate connection models a writer in another tab sharing IndexedDB.
      let finish!: (response: Response) => void
      let requestUrl = ''
      fetchMock.mockImplementation((url: string) => { requestUrl = url; return new Promise<Response>(resolve => { finish = resolve }) })
      const manual = syncNow()
      await waitFor(() => !!finish)
      const local = { ...server, doc: { ...server.doc, name: `${type} locally` } }
      const db = await new Promise<IDBDatabase>(resolve => {
        const request = indexedDB.open('unforked-local')
        request.onsuccess = () => resolve(request.result)
      })
      const tx = db.transaction(['recipes', 'outbox'], 'readwrite')
      if (type === 'delete') tx.objectStore('recipes').delete(server.id)
      else tx.objectStore('recipes').put(local)
      tx.objectStore('outbox').add({ opId: crypto.randomUUID(), entity: 'recipe', key: server.id, type,
        payload: type === 'update' ? { baseDoc: server.doc, nextDoc: local.doc } : local.doc,
        createdAt: 1, attempts: 0, ...(parked ? { parkedAt: 1 } : {}) })
      await new Promise<void>(resolve => { tx.oncomplete = () => resolve() })
      // Subsequent observed keys must not hang (keys intentionally survive tests).
      fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith('/recipes') ? [server] : server))))
      finish(new Response(JSON.stringify(requestUrl.endsWith('/recipes') ? (type === 'create' ? [] : [server]) : server)))
      await manual
      expect(await getLocalRecipe(server.id)).toEqual(type === 'delete' ? null : local)
      const clear = db.transaction('outbox', 'readwrite')
      clear.objectStore('outbox').clear()
      await new Promise<void>(resolve => { clear.oncomplete = () => resolve() })
      db.close()
      await putLocalRecipe(server)
    }
  }
})

it('preserves an update queued while the single-recipe GET itself is in flight', async () => {
  const server: Recipe = { id: 'detail-race', doc: { name: 'Server', description: '', sourceUrl: null, sourceName: null, servings: 2, tags: [], ingredients: [], steps: [] } }
  await putLocalRecipe(server)
  let finish!: (response: Response) => void
  fetchMock.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  const pull = pullRecipe(server.id)
  await waitFor(() => !!finish)
  const local = { ...server, doc: { ...server.doc, name: 'New edit' } }
  await putLocalRecipe(local)
  await appendOutboxOp({ opId: 'detail', entity: 'recipe', key: server.id, type: 'update',
    payload: { baseDoc: server.doc, nextDoc: local.doc }, createdAt: 1, attempts: 0, parkedAt: 1 })
  finish(new Response(JSON.stringify(server)))
  await pull
  expect(await getLocalRecipe(server.id)).toEqual(local)
})

it.each([
  ['list', 'create'], ['list', 'update'], ['list', 'delete'],
  ['detail', 'update'], ['detail', 'delete'],
] as const)('does not overwrite a real %s/%s that successfully drains during a stale GET', async (scope, type) => {
  const server: Recipe = { id: 'drain-race', version: 1, doc: { name: 'Server', description: '', sourceUrl: null, sourceName: null, servings: 2, tags: [], ingredients: [], steps: [] } }
  await putLocalRecipe(server)
  let finish!: (response: Response) => void
  fetchMock.mockImplementation((_url, init) => {
    if (!init?.method) return new Promise<Response>(resolve => { finish = resolve })
    if (init.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    const body = JSON.parse(init.body)
    return Promise.resolve(new Response(JSON.stringify({ id: body.id ?? server.id, doc: body.doc, version: 2 })))
  })
  const pull = scope === 'list' ? pullRecipes() : pullRecipe(server.id)
  await waitFor(() => !!finish)
  const doc = { ...server.doc, name: 'New local recipe' }
  let id = server.id
  if (type === 'create') id = (await createRecipe(doc)).id
  else if (type === 'update') await updateRecipe(id, doc)
  else await deleteRecipe(id)
  await drainOutbox()
  expect(await listOutboxOps()).toHaveLength(0)
  const local = await getLocalRecipe(id)
  expect(local?.doc.name ?? null).toBe(type === 'delete' ? null : doc.name)
  finish(new Response(JSON.stringify(scope === 'list' ? [server] : server)))
  await pull
  expect(await getLocalRecipe(id)).toEqual(local)
  // Revisions protect older requests, not subsequent authoritative snapshots.
  fetchMock.mockResolvedValue(new Response(JSON.stringify(scope === 'list' ? [server] : server)))
  if (scope === 'list') await pullRecipes()
  else await pullRecipe(server.id)
  expect(await getLocalRecipe(server.id)).toMatchObject(server)
})

it('shares pull generations with a writer on an independent IndexedDB connection', async () => {
  const recipe: Recipe = { id: 'other-tab', doc: { name: 'Server', description: '', sourceUrl: null, sourceName: null, servings: 2, tags: [], ingredients: [], steps: [] } }
  await putLocalRecipe(recipe)
  const guard = await beginRecipePull()
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('unforked-local')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    // Model the other tab's atomic delete and already-successful drain. No
    // BroadcastChannel delivery or remaining outbox record can protect this key.
    const tx = db.transaction(['recipes', 'outbox', 'syncMeta'], 'readwrite')
    tx.objectStore('recipes').delete(recipe.id)
    tx.objectStore('syncMeta').put({ key: 'recipes:writeGeneration', value: guard.generation + 1 })
    tx.objectStore('syncMeta').put({ key: `recipes:writeRevision:${recipe.id}`, value: guard.generation + 1 })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
    expect(await listOutboxOps()).toHaveLength(0)
    await applyRecipePull([recipe], true, guard)
    expect(await getLocalRecipe(recipe.id)).toBeNull()
  } finally { db.close() }
})

it('never advances a dependent op past a parked create on later drains or manual sync', async () => {
  await appendOutboxOp({ opId: 'create', entity: 'recipe', type: 'create', key: 'r', payload: {}, createdAt: 1, attempts: 0 })
  await appendOutboxOp({ opId: 'delete', entity: 'recipe', type: 'delete', key: 'r', payload: {}, createdAt: 2, attempts: 0 })
  fetchMock.mockResolvedValue(new Response('', { status: 403 }))
  await drainOutbox()
  fetchMock.mockClear()
  await drainOutbox()
  await syncNow()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(await listOutboxOps()).toHaveLength(2)
})

it('forwards follower observed keys without sending its own drain or manual pulls', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ weekIdentifier: '2026-W17', assignments: [], defaultPersons: null })))
  await pullMealPlan('2026-W17')
  fetchMock.mockClear()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => new Promise(() => {}) } })
  startLeaderElection()
  const messages: CrossTabMessage[] = []
  const other = new BroadcastChannel('unforked-cross-tab')
  other.onmessage = event => messages.push(event.data)
  try {
    let finished = false
    const manual = syncNow().then(() => { finished = true })
    await waitFor(() => messages.some(m => m.kind === 'sync-now'))
    const request = messages.find(m => m.kind === 'sync-now')!
    expect(request).toMatchObject({ keys: expect.arrayContaining(['mealPlan:2026-W17']) })
    expect(finished).toBe(false)
    if (request.kind !== 'sync-now') throw new Error('missing request')
    other.postMessage({ kind: 'sync-complete', requestId: request.requestId, failed: false })
    await manual
    expect(finished).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  } finally { other.close() }
})

it('rejects a lost follower request after the bounded acknowledgement wait', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => new Promise(() => {}) } })
  startLeaderElection()
  const timers = vi.spyOn(globalThis, 'setTimeout')
  try {
    const manual = syncNow()
    const rejected = expect(manual).rejects.toThrow('Manual sync did not complete')
    await waitFor(() => timers.mock.calls.some(([, delay]) => delay === 60_000))
    const timeout = timers.mock.calls.find(([, delay]) => delay === 60_000)![0] as () => void
    timeout()
    await rejected
  } finally { timers.mockRestore() }
})

it('finishes an outstanding manual request when the follower takes leadership', async () => {
  let grant!: () => void
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (_name: string, callback: () => void) => { grant = callback; return new Promise(() => {}) },
  } })
  startLeaderElection()
  fetchMock.mockImplementation(() => Promise.resolve(new Response('[]')))
  const timers = vi.spyOn(globalThis, 'setTimeout')
  try {
    const manual = syncNow()
    await waitFor(() => timers.mock.calls.some(([, delay]) => delay === 60_000))
    grant()
    await manual
  } finally { timers.mockRestore() }
})

it('leader handles a follower-only key and broadcasts its real pull result', async () => {
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ weekIdentifier: '2026-W18', assignments: [], defaultPersons: null }))))
  startOutboxSync()
  const other = new BroadcastChannel('unforked-cross-tab')
  const messages: CrossTabMessage[] = []
  other.onmessage = event => messages.push(event.data)
  try {
    other.postMessage({ kind: 'sync-now', requestId: 'follower-request', keys: ['mealPlan:2026-W18'] })
    await waitFor(() => messages.some(m => m.kind === 'sync-outcome' && m.key === 'mealPlan:2026-W18' && !m.outcome.active))
    expect(fetchMock.mock.calls.some(([url]) => url.includes('2026-W18'))).toBe(true)
  } finally { other.close() }
})
