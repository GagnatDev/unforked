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

// The hook reads the signed-in user for the optimistic approver metadata.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'ann@example.com', role: 'user', familyId: 'fam-1' },
  }),
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

  it('defaults to an open status when the doc carries none', async () => {
    const { result } = await renderLoaded()
    expect(result.current.status).toBe('open')
    expect(result.current.approvedByEmail).toBeNull()
  })

  it('approves optimistically with the signed-in user and queues a status op', async () => {
    mocks.get.mockResolvedValue({ weekIdentifier: week, items: [entry({})], version: 3 })
    const { result } = await renderLoaded()

    act(() => result.current.approve())
    await waitFor(() => expect(result.current.status).toBe('approved'))
    expect(result.current.approvedBy).toBe('user-1')
    expect(result.current.approvedByEmail).toBe('ann@example.com')
    expect(new Date(result.current.approvedAt!).getTime()).not.toBeNaN()

    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      entity: 'shoppingStatus',
      type: 'update',
      key: week,
      baseVersion: 3,
    })
    expect(ops[0].payload).toMatchObject({
      weekId: week,
      status: 'approved',
      approvedBy: 'user-1',
      approvedByEmail: 'ann@example.com',
    })
  })

  it('reopens optimistically, clearing the approval fields, and queues a status op', async () => {
    mocks.get.mockResolvedValue({
      weekIdentifier: week,
      items: [entry({})],
      version: 4,
      status: 'approved',
      approvedBy: 'user-2',
      approvedByEmail: 'partner@example.com',
      approvedAt: '2026-07-06T17:12:00.000Z',
    })
    const { result } = await renderLoaded()
    await waitFor(() => expect(result.current.status).toBe('approved'))

    act(() => result.current.reopen())
    await waitFor(() => expect(result.current.status).toBe('open'))
    expect(result.current.approvedBy).toBeNull()
    expect(result.current.approvedByEmail).toBeNull()
    expect(result.current.approvedAt).toBeNull()

    const ops = await listOutboxOps()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'shoppingStatus', key: week, baseVersion: 4 })
    expect(ops[0].payload).toEqual({ weekId: week, status: 'open' })
  })
})
