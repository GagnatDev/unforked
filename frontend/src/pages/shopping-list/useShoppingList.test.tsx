import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLocalDbForTests } from '@/local/db'
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
  globalThis.indexedDB = new IDBFactory()
  mocks.get.mockResolvedValue({ weekIdentifier: week, items: [entry({})] })
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

  it('toggles optimistically and confirms with the server entry', async () => {
    mocks.patchItem.mockResolvedValue(entry({ checked: true }))
    const { result } = await renderLoaded()

    act(() => result.current.toggleChecked('item-1'))
    await waitFor(() => expect(result.current.items?.[0].checked).toBe(true))

    await waitFor(() =>
      expect(mocks.patchItem).toHaveBeenCalledWith('item-1', { checked: true }, week),
    )
  })

  it('rolls back the toggle and flags the failure when the PATCH rejects', async () => {
    let rejectPatch!: (e: Error) => void
    mocks.patchItem.mockImplementation(
      () => new Promise((_, reject) => (rejectPatch = reject)),
    )
    const { result } = await renderLoaded()

    act(() => result.current.toggleChecked('item-1'))
    await waitFor(() => expect(result.current.items?.[0].checked).toBe(true))

    act(() => rejectPatch(new Error('offline')))
    await waitFor(() => expect(result.current.mutationFailed).toBe(true))
    await waitFor(() => expect(result.current.items?.[0].checked).toBe(false))
  })

  it('changes category via PATCH', async () => {
    mocks.patchItem.mockResolvedValue(entry({ category: 'beverages' }))
    const { result } = await renderLoaded()

    act(() => result.current.changeCategory('item-1', 'beverages'))
    await waitFor(() => expect(result.current.items?.[0].category).toBe('beverages'))

    await waitFor(() =>
      expect(mocks.patchItem).toHaveBeenCalledWith('item-1', { category: 'beverages' }, week),
    )
  })

  it('edits name/quantity/unit optimistically and confirms with the server entry', async () => {
    const edited = entry({ id: 'item-1', name: 'Whole milk', quantity: '2', unit: 'l', manual: true })
    mocks.patchItem.mockResolvedValue(edited)
    const { result } = await renderLoaded()

    act(() =>
      result.current.editItem('item-1', { name: 'Whole milk', quantity: '2', unit: 'l' }),
    )
    await waitFor(() =>
      expect(result.current.items?.[0]).toMatchObject({ name: 'Whole milk', quantity: '2', unit: 'l' }),
    )

    await waitFor(() =>
      expect(mocks.patchItem).toHaveBeenCalledWith(
        'item-1',
        { name: 'Whole milk', quantity: '2', unit: 'l' },
        week,
      ),
    )
  })

  it('rolls back an edit and flags the failure when the PATCH rejects', async () => {
    let rejectPatch!: (e: Error) => void
    mocks.patchItem.mockImplementation(
      () => new Promise((_, reject) => (rejectPatch = reject)),
    )
    const { result } = await renderLoaded()

    act(() => result.current.editItem('item-1', { name: 'Whole milk' }))
    await waitFor(() => expect(result.current.items?.[0].name).toBe('Whole milk'))

    act(() => rejectPatch(new Error('offline')))
    await waitFor(() => expect(result.current.mutationFailed).toBe(true))
    await waitFor(() => expect(result.current.items?.[0].name).toBe('Milk'))
  })

  it('appends the server-created entry on add', async () => {
    const created = entry({ id: 'manual-1', name: 'Kaffe', category: 'beverages', manual: true })
    mocks.addItem.mockResolvedValue(created)
    const { result } = await renderLoaded()

    let ok = false
    await act(async () => {
      ok = await result.current.addItem('Kaffe')
    })
    expect(ok).toBe(true)
    expect(mocks.addItem).toHaveBeenCalledWith({ name: 'Kaffe' }, week)
    await waitFor(() =>
      expect(result.current.items?.map((i) => i.id)).toEqual(['item-1', 'manual-1']),
    )
  })

  it('reports a failed add without touching the list', async () => {
    mocks.addItem.mockRejectedValue(new Error('offline'))
    const { result } = await renderLoaded()

    let ok = true
    await act(async () => {
      ok = await result.current.addItem('Kaffe')
    })
    expect(ok).toBe(false)
    expect(result.current.mutationFailed).toBe(true)
    expect(result.current.items).toHaveLength(1)
  })

  it('removes optimistically and restores the item when DELETE fails', async () => {
    let rejectDelete!: (e: Error) => void
    mocks.deleteItem.mockImplementation(
      () => new Promise((_, reject) => (rejectDelete = reject)),
    )
    const { result } = await renderLoaded()

    act(() => result.current.deleteItem('item-1'))
    await waitFor(() => expect(result.current.items).toHaveLength(0))

    act(() => rejectDelete(new Error('offline')))
    await waitFor(() => expect(result.current.mutationFailed).toBe(true))
    await waitFor(() => expect(result.current.items?.map((i) => i.id)).toEqual(['item-1']))
  })
})
