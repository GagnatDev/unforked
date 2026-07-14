import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLocalDbForTests, listOutboxOps } from '@/local/db'
import { __resetOutboxSyncForTests } from '@/local/outboxSync'
import type { ShoppingListEntry } from '@/types'
import { useShoppingList } from './useShoppingList'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patchItem: vi.fn(),
  addItem: vi.fn(),
  deleteItem: vi.fn(),
}))

vi.mock('@/api', () => ({
  api: { shoppingList: mocks },
}))

function entry(overrides: Partial<ShoppingListEntry>): ShoppingListEntry {
  return {
    id: 'item-1',
    name: 'Milk',
    quantity: '1',
    unit: 'l',
    recipeIds: ['r1'],
    category: 'dairy',
    checked: false,
    manual: false,
    ...overrides,
  }
}

const week = '2026-W28'

beforeEach(async () => {
  vi.resetAllMocks()
  await __resetLocalDbForTests()
  __resetOutboxSyncForTests()
  globalThis.indexedDB = new IDBFactory()
  mocks.get.mockResolvedValue({ weekIdentifier: week, items: [entry({})] })
  // Mutations kick the outbox sync engine, which uses global fetch; keep it
  // "offline" so ops stay queued and assertions on the queue are deterministic.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
})

afterEach(() => {
  __resetOutboxSyncForTests()
  vi.unstubAllGlobals()
})

async function renderLoaded() {
  const hook = renderHook(() => useShoppingList(week))
  await waitFor(() => expect(hook.result.current.items).not.toBeNull())
  return hook
}

describe('useShoppingList', () => {
  it('loads items for the week into the local store', async () => {
    const { result } = await renderLoaded()
    expect(mocks.get).toHaveBeenCalledWith(week)
    expect(result.current.items).toHaveLength(1)
  })

  it('toggles optimistically and queues an update op', async () => {
    const { result } = await renderLoaded()

    act(() => result.current.toggleChecked('item-1'))
    await waitFor(() => expect(result.current.items?.[0].checked).toBe(true))

    await waitFor(async () => {
      const ops = await listOutboxOps()
      expect(ops).toHaveLength(1)
      expect(ops[0]).toMatchObject({ entity: 'shoppingItem', type: 'update', key: 'item-1' })
      expect((ops[0].payload as { patch: unknown }).patch).toEqual({ checked: true })
    })
  })

  it('changes category optimistically and queues an update op', async () => {
    const { result } = await renderLoaded()

    act(() => result.current.changeCategory('item-1', 'beverages'))
    await waitFor(() => expect(result.current.items?.[0].category).toBe('beverages'))

    const ops = await listOutboxOps()
    expect((ops[0].payload as { patch: unknown }).patch).toEqual({ category: 'beverages' })
  })

  it('edits name/quantity/unit optimistically and queues an update op', async () => {
    const { result } = await renderLoaded()

    act(() => result.current.editItem('item-1', { name: 'Whole milk', quantity: '2', unit: 'l' }))
    await waitFor(() =>
      expect(result.current.items?.[0]).toMatchObject({ name: 'Whole milk', quantity: '2', unit: 'l' }),
    )

    const ops = await listOutboxOps()
    expect((ops[0].payload as { patch: unknown }).patch).toEqual({
      name: 'Whole milk',
      quantity: '2',
      unit: 'l',
    })
  })

  it('adds a manual item optimistically with a local category and queues a create op', async () => {
    const { result } = await renderLoaded()

    let ok = false
    await act(async () => {
      ok = await result.current.addItem('Kaffe')
    })
    expect(ok).toBe(true)
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    const added = result.current.items?.find((i) => i.name === 'Kaffe')
    expect(added).toMatchObject({ manual: true, checked: false, category: 'beverages', recipeIds: [] })

    const ops = await listOutboxOps()
    const createOp = ops.find((o) => o.type === 'create')
    expect(createOp).toMatchObject({ entity: 'shoppingItem', key: added!.id })
  })

  it('removes optimistically and queues a delete op', async () => {
    const { result } = await renderLoaded()

    act(() => result.current.deleteItem('item-1'))
    await waitFor(() => expect(result.current.items).toHaveLength(0))

    const ops = await listOutboxOps()
    expect(ops.some((o) => o.entity === 'shoppingItem' && o.type === 'delete' && o.key === 'item-1')).toBe(
      true,
    )
  })
})
