import { describe, expect, it } from 'vitest'

import type { PersistedShoppingListDoc, ShoppingListEntry } from '@/types'
import {
  approveShoppingDoc,
  clearShoppingStatus,
  completeShoppingTripInDoc,
  markShoppingDocReady,
  undoShoppingTripInDoc,
} from './shoppingDoc'

function entry(overrides: Partial<ShoppingListEntry>): ShoppingListEntry {
  return {
    id: 'milk',
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

const meta = {
  id: 'trip-1',
  completedAt: '2026-07-06T17:12:00.000Z',
  completedBy: 'user-1',
  completedByEmail: 'ann@example.com',
}

function doc(items: ShoppingListEntry[], extra: Partial<PersistedShoppingListDoc> = {}) {
  return { weekIdentifier: '2026-W28', items, ...extra }
}

describe('completeShoppingTripInDoc', () => {
  it('archives the checked items as a trip and leaves the rest open', () => {
    const result = completeShoppingTripInDoc(
      doc(
        [
          entry({ id: 'milk', checked: true }),
          entry({ id: 'bread', name: 'Bread', checked: false }),
          entry({ id: 'coffee', name: 'Coffee', manual: true, checked: true }),
        ],
        { status: 'approved', approvedBy: 'user-1', approvedByEmail: 'ann@example.com', approvedAt: 't' },
      ),
      meta,
    )
    expect(result.items.map((i) => i.id)).toEqual(['bread'])
    expect(result.trips).toHaveLength(1)
    expect(result.trips![0]).toMatchObject({ ...meta, items: [expect.objectContaining({ id: 'milk' }), expect.objectContaining({ id: 'coffee' })] })
    expect(result.status).toBeUndefined()
    expect(result.approvedByEmail).toBeUndefined()
  })

  it('appends to existing trips and is idempotent on the trip id', () => {
    const once = completeShoppingTripInDoc(doc([entry({ checked: true })], { trips: [{ ...meta, id: 'older', items: [] }] }), meta)
    expect(once.trips!.map((t) => t.id)).toEqual(['older', 'trip-1'])
    const twice = completeShoppingTripInDoc({ ...once, items: [entry({ id: 'bread', checked: true })] }, meta)
    expect(twice.trips).toHaveLength(2)
    expect(twice.items.map((i) => i.id)).toEqual(['bread'])
  })

  it('with nothing checked only clears the trip state (no history entry)', () => {
    const result = completeShoppingTripInDoc(
      doc([entry({ checked: false })], { status: 'ready', readyBy: 'u', readyByEmail: 'u@x', readyAt: 't' }),
      meta,
    )
    expect(result.trips).toBeUndefined()
    expect(result.items).toHaveLength(1)
    expect(result.status).toBeUndefined()
    expect(result.readyBy).toBeUndefined()
  })
})

describe('undoShoppingTripInDoc', () => {
  it('returns the trip\'s items to the open list, still checked, and drops the trip', () => {
    const archived = completeShoppingTripInDoc(doc([entry({ checked: true }), entry({ id: 'bread', name: 'Bread' })]), meta)
    const result = undoShoppingTripInDoc(archived, 'trip-1')
    expect(result.items.map((i) => [i.id, i.checked])).toEqual([
      ['bread', false],
      ['milk', true],
    ])
    expect('trips' in result).toBe(false)
  })

  it('does not duplicate an item the open list already has, and ignores unknown trips', () => {
    const archived = completeShoppingTripInDoc(doc([entry({ checked: true })]), meta)
    const withDuplicate = { ...archived, items: [entry({ id: 'milk', checked: false })] }
    expect(undoShoppingTripInDoc(withDuplicate, 'trip-1').items).toHaveLength(1)
    expect(undoShoppingTripInDoc(archived, 'nope')).toBe(archived)
  })
})

describe('status transforms', () => {
  it('approve clears a ready state; ready leaves an approved doc alone; clear strips everything', () => {
    const ready = markShoppingDocReady(doc([]), { id: 'u1', email: 'ann@example.com' }, 't1')
    expect(ready).toMatchObject({ status: 'ready', readyBy: 'u1', readyByEmail: 'ann@example.com', readyAt: 't1' })

    const approved = approveShoppingDoc(ready, { id: 'u2', email: 'bo@example.com' }, 't2')
    expect(approved).toMatchObject({ status: 'approved', approvedBy: 'u2', approvedAt: 't2' })
    expect(approved.readyBy).toBeUndefined()

    expect(markShoppingDocReady(approved, { id: 'u1', email: 'ann@example.com' }, 't3')).toBe(approved)
    expect(clearShoppingStatus(approved)).toEqual(doc([]))
  })
})
