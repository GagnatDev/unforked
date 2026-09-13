import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { __resetLocalDbForTests, getLocalMealPlan, getLocalShoppingList, listOutboxOps, putLocalMealPlan, putLocalShoppingList, listLocalRecipes } from './db'
import { __resetOutboxSyncForTests, drainOutbox, scheduleSync, startOutboxSync, syncNow } from './outboxSync'
import { __resetCrossTabForTests } from './crossTab'
import { __resetSyncStatusForTests } from './syncStatus'
import { pullMealPlan, pullShoppingList } from './sync'
import * as sync from './sync'
import { saveMealPlan, addShoppingItem } from './mutations'
import { waitFor } from '@/test/waitFor'
import { waitFor as waitForAssertion } from '@testing-library/react'
import { rememberPullKey, listKnownPullKeys, appendOutboxOp, deleteOutboxOp } from './db'
import { requestPull } from './pullDemand'

vi.mock('@/lib/reauth', () => ({ requestReauth: vi.fn() }))
vi.mock('./liveEvents', () => ({ noteShoppingFlush: vi.fn() }))
let fetchMock: ReturnType<typeof vi.fn>
const week = '2026-W23'
beforeEach(async () => {
  await __resetLocalDbForTests()
  __resetOutboxSyncForTests()
  __resetSyncStatusForTests()
  __resetCrossTabForTests()
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.endsWith('/recipes') ? [] : url.includes('meal-plans') ? { weekIdentifier: week, assignments: [], defaultPersons: null } : { weekIdentifier: week, items: [] },
  ))))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  __resetOutboxSyncForTests()
  __resetSyncStatusForTests()
  __resetCrossTabForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each(['mealPlan', 'shopping'] as const)('retains a %s write successfully drained while an older GET is pending', async kind => {
  const plan = { weekIdentifier: week, assignments: [], defaultPersons: null }
  const shopping = { weekIdentifier: week, items: [] }
  await putLocalMealPlan(week, plan)
  await putLocalShoppingList(week, shopping)
  let finish!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const pull = kind === 'mealPlan' ? pullMealPlan(week) : pullShoppingList(week)
  await waitFor(() => !!finish)
  if (kind === 'mealPlan') await saveMealPlan(week, { ...plan, defaultPersons: 7 })
  else await addShoppingItem(week, 'Locally added')
  await drainOutbox()
  expect(await listOutboxOps()).toHaveLength(0)
  const read = () => kind === 'mealPlan' ? getLocalMealPlan(week) : getLocalShoppingList(week)
  const local = await read()
  finish(new Response(JSON.stringify(kind === 'mealPlan' ? plan : shopping)))
  await pull
  expect(await read()).toEqual(local)
  // Protection is relative to this GET, not a permanent dirty flag.
  await (kind === 'mealPlan' ? pullMealPlan(week) : pullShoppingList(week))
  expect(await read()).toEqual(kind === 'mealPlan' ? plan : shopping)
})

it('initial leader run discovers persisted weeks and catches up recipes without navigation', async () => {
  await putLocalMealPlan(week, { weekIdentifier: week, assignments: [], defaultPersons: 9 })
  await putLocalShoppingList(week, { weekIdentifier: week, items: [] })
  startOutboxSync()
  await waitFor(() => fetchMock.mock.calls.some(([url]) => url.endsWith('/recipes')))
  await syncNow()
  expect(await listLocalRecipes()).toEqual([])
  expect((await getLocalMealPlan(week))?.defaultPersons).toBe(null)
  expect(fetchMock.mock.calls.some(([url]) => url.includes('shopping-lists'))).toBe(true)
})

it.each(['online', 'focus', 'visibilitychange'])('%s runs catch-up without mounted views', async event => {
  startOutboxSync()
  await syncNow()
  fetchMock.mockClear()
  if (event === 'visibilitychange') document.dispatchEvent(new Event(event))
  else window.dispatchEvent(new Event(event))
  await waitFor(() => fetchMock.mock.calls.some(([url]) => url.endsWith('/recipes')))
  await syncNow()
})

it('persists absent-week demand and services it on startup without a mounted view', async () => {
  await rememberPullKey(`mealPlan:${week}`)
  expect(await getLocalMealPlan(week)).toBeNull()
  expect(await listKnownPullKeys()).toContain(`mealPlan:${week}`)
  startOutboxSync()
  await syncNow()
  expect(await getLocalMealPlan(week)).not.toBeNull()
})

it('coalesces demand during a GET into a trailing pass, without parallel requests or notification loops', async () => {
  startOutboxSync()
  await syncNow()
  let finish!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const first = requestPull('recipes')
  await waitFor(() => !!finish)
  const calls = fetchMock.mock.calls.length
  const trailing = requestPull(`mealPlan:${week}`)
  await waitForAssertion(async () => expect(await listKnownPullKeys()).toContain(`mealPlan:${week}`))
  expect(fetchMock.mock.calls).toHaveLength(calls)
  finish(new Response('[]'))
  await Promise.all([first, trailing])
  expect(await getLocalMealPlan(week)).not.toBeNull()
  const settled = fetchMock.mock.calls.length
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(fetchMock.mock.calls).toHaveLength(settled)
})

it.each(['mealPlan', 'shopping'] as const)('retains %s when an op pending at GET start is drained independently', async kind => {
  const plan = { weekIdentifier: week, assignments: [], defaultPersons: 7 }
  const shopping = { weekIdentifier: week, items: [] }
  await putLocalMealPlan(week, plan)
  await putLocalShoppingList(week, shopping)
  await appendOutboxOp({ opId: 'start-pending', entity: kind === 'mealPlan' ? 'mealPlan' : 'shoppingItem', type: 'update', key: week,
    payload: kind === 'mealPlan' ? { baseDoc: plan, nextDoc: plan } : { weekId: week, patch: { checked: true } }, createdAt: 1, attempts: 0 })
  let finish!: (response: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const pull = kind === 'mealPlan' ? pullMealPlan(week) : pullShoppingList(week)
  await waitFor(() => !!finish)
  await deleteOutboxOp((await listOutboxOps())[0].seq!)
  finish(new Response(JSON.stringify(kind === 'mealPlan' ? { ...plan, defaultPersons: 1 } : { ...shopping, version: 99 })))
  await pull
  expect(await (kind === 'mealPlan' ? getLocalMealPlan(week) : getLocalShoppingList(week))).toEqual(kind === 'mealPlan' ? plan : shopping)
})

it('automatically pushes a write made during GET and applies a trailing fresh week', async () => {
  await putLocalMealPlan(week, { weekIdentifier: week, assignments: [], defaultPersons: 4 })
  startOutboxSync()
  await syncNow()
  let finish!: (response: Response) => void
  let gets = 0
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('meal-plans') && !init?.method) {
      gets++
      if (gets === 1) return new Promise<Response>(resolve => { finish = resolve })
      return Promise.resolve(new Response(JSON.stringify({ weekIdentifier: week, assignments: [], defaultPersons: 8 })))
    }
    return Promise.resolve(new Response(url.endsWith('/recipes') ? '[]' : '{}'))
  })
  const run = syncNow()
  await waitFor(() => !!finish)
  await saveMealPlan(week, { weekIdentifier: week, assignments: [], defaultPersons: 7 })
  finish(new Response(JSON.stringify({ weekIdentifier: week, assignments: [], defaultPersons: 1 })))
  await run
  expect(await listOutboxOps()).toHaveLength(0)
  expect(gets).toBe(3) // stale pull, push's merge read, trailing fresh pull
  expect((await getLocalMealPlan(week))?.defaultPersons).toBe(8)
})

it('stops the pull batch if a queued write arrives during its first GET', async () => {
  startOutboxSync()
  await syncNow()
  let finish!: (response: Response) => void
  fetchMock.mockClear().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const run = syncNow(['recipes', `mealPlan:${week}`])
  await waitFor(() => !!finish)
  await appendOutboxOp({ opId: 'queued', entity: 'recipe', type: 'delete', key: 'blocked', createdAt: 1, attempts: 0 })
  finish(new Response('[]'))
  await run
  expect(fetchMock.mock.calls).toHaveLength(1)
})

// Nothing un-parks an op, so a parked one must never become a permanent stop
// on reconciliation: its intent is preserved by the pull overlay instead.
it('keeps reconciling every view while a write stays parked', async () => {
  startOutboxSync()
  await syncNow()
  await putLocalMealPlan(week, { weekIdentifier: week, assignments: [], defaultPersons: 9 })
  await appendOutboxOp({ opId: 'parked', entity: 'recipe', type: 'delete', key: 'blocked', createdAt: 1, attempts: 1, parkedAt: 1 })
  fetchMock.mockClear()
  await syncNow(['recipes', `mealPlan:${week}`])
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/recipes'))).toBe(true)
  expect(fetchMock.mock.calls.some(([url]) => url.includes('meal-plans'))).toBe(true)
  expect((await getLocalMealPlan(week))?.defaultPersons).toBeNull()
})

it('a local online write pushes then refreshes recipes without navigation', async () => {
  startOutboxSync()
  await syncNow()
  fetchMock.mockClear()
  await addShoppingItem(week, 'Milk')
  await waitFor(() => fetchMock.mock.calls.some(([url, init]) => url.endsWith('/recipes') && !init?.method))
  await syncNow()
  expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  expect(await listOutboxOps()).toHaveLength(0)
})

// Queue the kick behind the runner's final await continuation, but ahead of
// promise-finalization reactions. This is later than a write during the GET.
it('flushes demand arriving in the final pull completion microtask window', async () => {
  startOutboxSync()
  await syncNow()
  const retry = vi.spyOn(sync, 'retryPullKeys').mockImplementationOnce(() => {
    const completed = Promise.resolve()
    void completed.then(() => queueMicrotask(scheduleSync))
    return completed
  })
  await syncNow()
  await waitForAssertion(() => expect(retry).toHaveBeenCalledTimes(2))
  await syncNow()
  const settled = retry.mock.calls.length
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(retry).toHaveBeenCalledTimes(settled)
})

it('catches up cached and durable absent weeks when a follower acquires leadership', async () => {
  let acquire!: () => Promise<never>
  vi.stubGlobal('navigator', { onLine: true, locks: { request: vi.fn((_name, callback) => { acquire = callback }) } })
  await putLocalMealPlan(week, { weekIdentifier: week, assignments: [], defaultPersons: 9 })
  await rememberPullKey(`shopping:${week}`)
  startOutboxSync()
  expect(fetchMock).not.toHaveBeenCalled()
  void acquire()
  await waitForAssertion(async () => {
    expect((await getLocalMealPlan(week))?.defaultPersons).toBeNull()
    expect(await getLocalShoppingList(week)).not.toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/recipes'))).toBe(true)
  })
  await syncNow()
})

it.each(['mealPlan', 'shopping'] as const)('direct %s pulls overlay parked intent while accepting unrelated server fields', async kind => {
  const base = { weekIdentifier: week, assignments: [], defaultPersons: 2 }
  await appendOutboxOp({ opId: 'parked-overlay', entity: kind === 'mealPlan' ? 'mealPlan' : 'shoppingItem',
    type: 'update', key: kind === 'mealPlan' ? week : 'item', createdAt: 1, attempts: 1, parkedAt: 1,
    payload: kind === 'mealPlan' ? { baseDoc: base, nextDoc: { ...base, defaultPersons: 7 } }
      : { weekId: week, patch: { checked: true } } })
  fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(kind === 'mealPlan'
    ? { ...base, assignments: [{ day: 'monday', recipeId: 'server', recipeName: 'Server recipe', persons: null }] }
    : { weekIdentifier: week, version: 42, items: [{ id: 'item', name: 'Server name', checked: false }] }))))
  await (kind === 'mealPlan' ? pullMealPlan(week) : pullShoppingList(week))
  if (kind === 'mealPlan') expect(await getLocalMealPlan(week)).toMatchObject({ defaultPersons: 7, assignments: [{ recipeId: 'server' }] })
  else expect(await getLocalShoppingList(week)).toMatchObject({ version: 42, items: [{ id: 'item', name: 'Server name', checked: true }] })
  expect((await listOutboxOps())[0].parkedAt).toBe(1)
})
