import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentWeekId, getNextWeekId } from '@/lib/utils'
import { __resetLocalDbForTests, putLocalShoppingList } from '@/local/db'
import type { ShoppingListEntry } from '@/types'
import { useShoppingWeek } from './useShoppingWeek'

const thisWeek = getCurrentWeekId()
const nextWeek = getNextWeekId()

function entry(): ShoppingListEntry {
  return {
    id: 'item-1',
    name: 'Milk',
    quantity: '1',
    unit: 'l',
    recipeIds: ['r1'],
    category: 'dairy',
    checked: false,
    manual: false,
  }
}

async function putList(weekId: string, items: ShoppingListEntry[]) {
  await putLocalShoppingList(weekId, { weekIdentifier: weekId, items })
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useShoppingWeek', () => {
  it('opens on next week while nothing is known about it yet', () => {
    const { result } = renderHook(() => useShoppingWeek(null))

    expect(result.current.weekId).toBe(nextWeek)
    expect(result.current.resolving).toBe(false)
  })

  it('stays on next week when its list has items', async () => {
    await putList(nextWeek, [entry()])

    const { result } = renderHook(() => useShoppingWeek(null))

    await waitFor(() => expect(result.current.resolving).toBe(false))
    expect(result.current.weekId).toBe(nextWeek)
  })

  it('falls back to this week when next week’s list is empty', async () => {
    await putList(nextWeek, [])

    const { result } = renderHook(() => useShoppingWeek(null))

    await waitFor(() => expect(result.current.weekId).toBe(thisWeek))
    expect(result.current.resolving).toBe(false)
  })

  it('falls back once next week arrives empty from a pull', async () => {
    const { result } = renderHook(() => useShoppingWeek(null))
    expect(result.current.weekId).toBe(nextWeek)

    // What `pullShoppingList` does once the request lands: the write notifies
    // the local subscription, which is where the decision is made.
    await putList(nextWeek, [])

    await waitFor(() => expect(result.current.weekId).toBe(thisWeek))
  })

  it('keeps this week once it has fallen back, even if next week fills up', async () => {
    await putList(nextWeek, [])
    const { result } = renderHook(() => useShoppingWeek(null))
    await waitFor(() => expect(result.current.weekId).toBe(thisWeek))

    await putList(nextWeek, [entry()])

    // The list must not move under someone who is already shopping from it.
    await waitFor(() => expect(result.current.weekId).toBe(thisWeek))
  })

  it('honours a pinned week even when its list is empty', async () => {
    await putList('2026-W40', [])
    await putList(nextWeek, [])

    const { result } = renderHook(() => useShoppingWeek('2026-W40'))

    await waitFor(() => expect(result.current.resolving).toBe(false))
    expect(result.current.weekId).toBe('2026-W40')
  })
})
