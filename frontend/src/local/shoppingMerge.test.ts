import { describe, expect, it } from 'vitest'

import type { PersistedShoppingListDoc, ShoppingListEntry } from '@/types'
import type { OutboxOp } from './db'
import { applyShoppingOps } from './shoppingMerge'

const week = '2026-W28'

function entry(overrides: Partial<ShoppingListEntry>): ShoppingListEntry {
  return {
    id: 'srv-1',
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

function doc(items: ShoppingListEntry[]): PersistedShoppingListDoc {
  return { weekIdentifier: week, items }
}

function op(overrides: Partial<OutboxOp>): OutboxOp {
  return {
    opId: `op-${Math.random()}`,
    entity: 'shoppingItem',
    type: 'update',
    key: 'srv-1',
    createdAt: 1,
    attempts: 0,
    ...overrides,
  }
}

describe('applyShoppingOps', () => {
  it('re-applies an unsynced offline add on top of the server doc', () => {
    const manual = entry({ id: 'local-1', name: 'Kaffe', manual: true, recipeIds: [] })
    const merged = applyShoppingOps(
      doc([entry({})]),
      [op({ type: 'create', key: 'local-1', payload: { weekId: week, item: manual } })],
      week,
    )
    expect(merged?.items.map((i) => i.id)).toEqual(['srv-1', 'local-1'])
  })

  it('does not duplicate an add the server already has', () => {
    const manual = entry({ id: 'local-1', name: 'Kaffe', manual: true, recipeIds: [] })
    const merged = applyShoppingOps(
      doc([entry({}), manual]),
      [op({ type: 'create', key: 'local-1', payload: { weekId: week, item: manual } })],
      week,
    )
    expect(merged?.items.filter((i) => i.id === 'local-1')).toHaveLength(1)
  })

  it('re-applies an unsynced checked toggle', () => {
    const merged = applyShoppingOps(
      doc([entry({ checked: false })]),
      [op({ type: 'update', key: 'srv-1', payload: { weekId: week, patch: { checked: true } } })],
      week,
    )
    expect(merged?.items[0].checked).toBe(true)
  })

  it('re-applies an unsynced delete', () => {
    const merged = applyShoppingOps(
      doc([entry({})]),
      [op({ type: 'delete', key: 'srv-1', payload: { weekId: week } })],
      week,
    )
    expect(merged?.items).toHaveLength(0)
  })

  it('ignores ops for a different week and non-shopping ops', () => {
    const merged = applyShoppingOps(
      doc([entry({ checked: false })]),
      [
        op({ type: 'update', key: 'srv-1', payload: { weekId: 'other', patch: { checked: true } } }),
        op({ entity: 'recipe', type: 'update', key: 'srv-1' }),
      ],
      week,
    )
    expect(merged?.items[0].checked).toBe(false)
  })

  it('creates a doc from an offline add when the server has none', () => {
    const manual = entry({ id: 'local-1', name: 'Kaffe', manual: true, recipeIds: [] })
    const merged = applyShoppingOps(
      null,
      [op({ type: 'create', key: 'local-1', payload: { weekId: week, item: manual } })],
      week,
    )
    expect(merged?.items.map((i) => i.id)).toEqual(['local-1'])
  })
})
