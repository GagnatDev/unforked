import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { __resetCrossTabForTests } from './crossTab'
import {
  __resetLocalDbForTests,
  putLocalMealPlan,
  putLocalShoppingList,
  rememberPullKey,
} from './db'
import { __resetOutboxSyncForTests, startOutboxSync, syncNow } from './outboxSync'
import { requestPull } from './pullDemand'
import { __resetSyncStatusForTests, getSyncStatus, subscribeSyncStatus } from './syncStatus'

vi.mock('@/lib/reauth', () => ({ requestReauth: vi.fn() }))
vi.mock('./liveEvents', () => ({ noteShoppingFlush: vi.fn() }))

const week = '2026-W23'
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await __resetLocalDbForTests()
  __resetOutboxSyncForTests()
  __resetSyncStatusForTests()
  __resetCrossTabForTests()
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.endsWith('/recipes') ? [] : url.includes('meal-plans')
      ? { weekIdentifier: week, assignments: [], defaultPersons: null }
      : { weekIdentifier: week, items: [] },
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

/** A profile that has browsed a few weeks and recipes before this navigation. */
async function seedBrowsingHistory(): Promise<void> {
  for (const id of ['2026-W20', '2026-W21', '2026-W22']) {
    await putLocalMealPlan(id, { weekIdentifier: id, assignments: [], defaultPersons: null })
    await putLocalShoppingList(id, { weekIdentifier: id, items: [] })
  }
  for (const id of ['r1', 'r2', 'r3']) await rememberPullKey(`recipe:${id}`)
}

it('pulls only what the opened view asked for, not the whole profile', async () => {
  await seedBrowsingHistory()
  startOutboxSync()
  await syncNow() // startup catch-up: everything known is refreshed once
  fetchMock.mockClear()

  await requestPull(`shopping:${week}`) // navigating to the shopping list

  const urls = fetchMock.mock.calls.map(([url]) => url as string)
  expect(urls).toHaveLength(1)
  expect(urls[0]).toContain('shopping-lists')
  expect(urls[0]).toContain(encodeURIComponent(week))
})

it('coalesces the several demands of one page into a pass over just those views', async () => {
  await seedBrowsingHistory()
  startOutboxSync()
  await syncNow()
  fetchMock.mockClear()

  // What mounting the weekly menu asks for: its week, the recipe list, the
  // family default. Three GETs — not three sweeps of the whole profile.
  await Promise.all([
    requestPull(`mealPlan:${week}`),
    requestPull('recipes'),
    requestPull('familyDefaults'),
  ])

  const urls = fetchMock.mock.calls.map(([url]) => url as string)
  expect(urls).toHaveLength(3)
  expect(urls.some(url => url.includes('meal-plans'))).toBe(true)
  expect(urls.some(url => url.endsWith('/recipes'))).toBe(true)
  expect(urls.some(url => url.includes('family'))).toBe(true)
})

it('keeps one continuous status run while a batch reconciles', async () => {
  startOutboxSync()
  await syncNow()
  const seen: boolean[] = []
  const stop = subscribeSyncStatus(() => seen.push(getSyncStatus().active))

  await syncNow(['recipes', `mealPlan:${week}`, `shopping:${week}`])
  stop()

  const settles = seen.filter((active, index) => !active && seen[index - 1]).length
  expect(settles).toBe(1)
})
