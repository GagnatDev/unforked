import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MealPlanDoc, PersistedShoppingListDoc, Recipe } from '@/types'
import {
  __resetLocalDbForTests,
  appendOutboxOp,
  countOutboxOps,
  deleteLocalRecipe,
  deleteOutboxOp,
  getLocalMealPlan,
  getLocalRecipe,
  getLocalShoppingList,
  getSyncMeta,
  listLocalRecipes,
  listOutboxOps,
  mutateLocalShoppingList,
  type OutboxOp,
  putLocalMealPlan,
  putLocalRecipe,
  putLocalShoppingList,
  putOutboxOp,
  replaceLocalRecipes,
  setSyncMeta,
  subscribeLocal,
} from './db'

function recipe(id: string, name: string): Recipe {
  return {
    id,
    doc: {
      name,
      description: '',
      sourceUrl: null,
      sourceName: null,
      ingredients: [],
      steps: [],
      servings: 4,
      tags: [],
    },
  }
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  // Fresh IndexedDB per test so state never leaks between cases.
  globalThis.indexedDB = new IDBFactory()
})

describe('recipes store', () => {
  it('is unknown (null) before any pull, and known-empty after an empty pull', async () => {
    expect(await listLocalRecipes()).toBeNull()
    await replaceLocalRecipes([])
    expect(await listLocalRecipes()).toEqual([])
  })

  it('lists individually stored recipes even before a full pull', async () => {
    await putLocalRecipe(recipe('r1', 'Soup'))
    expect(await listLocalRecipes()).toHaveLength(1)
  })

  it('replaces the collection on pull and sorts by name', async () => {
    await putLocalRecipe(recipe('stale', 'Gone after pull'))
    await replaceLocalRecipes([recipe('r2', 'Waffles'), recipe('r1', 'Apple pie')])
    const list = await listLocalRecipes()
    expect(list?.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(await getLocalRecipe('stale')).toBeNull()
  })

  it('gets and deletes a single recipe', async () => {
    await putLocalRecipe(recipe('r1', 'Soup'))
    expect((await getLocalRecipe('r1'))?.doc.name).toBe('Soup')
    await deleteLocalRecipe('r1')
    expect(await getLocalRecipe('r1')).toBeNull()
  })
})

describe('meal plans store', () => {
  it('keys by the requested week, not the doc weekIdentifier', async () => {
    const doc: MealPlanDoc = { weekIdentifier: '2026-W01', assignments: [] }
    await putLocalMealPlan('2026-W28', doc)
    expect(await getLocalMealPlan('2026-W28')).toEqual(doc)
    expect(await getLocalMealPlan('2026-W01')).toBeNull()
  })
})

describe('shopping lists store', () => {
  const doc: PersistedShoppingListDoc = {
    weekIdentifier: '2026-W28',
    items: [
      {
        id: 'i1',
        name: 'Milk',
        quantity: '1',
        unit: 'l',
        recipeIds: [],
        category: 'dairy',
        checked: false,
        manual: false,
      },
    ],
  }

  it('round-trips a week doc', async () => {
    await putLocalShoppingList('2026-W28', doc)
    expect(await getLocalShoppingList('2026-W28')).toEqual(doc)
    expect(await getLocalShoppingList('2026-W29')).toBeNull()
  })

  it('mutates a week doc read-modify-write', async () => {
    await putLocalShoppingList('2026-W28', doc)
    await mutateLocalShoppingList('2026-W28', (d) =>
      d ? { ...d, items: d.items.map((i) => ({ ...i, checked: true })) } : d,
    )
    expect((await getLocalShoppingList('2026-W28'))?.items[0].checked).toBe(true)
  })

  it('passes null to the mutator for a missing week', async () => {
    const mutate = vi.fn((d: PersistedShoppingListDoc | null) => d)
    await mutateLocalShoppingList('2026-W99', mutate)
    expect(mutate).toHaveBeenCalledWith(null)
  })
})

describe('syncMeta store', () => {
  it('round-trips values and returns undefined for unknown keys', async () => {
    expect(await getSyncMeta('nope')).toBeUndefined()
    await setSyncMeta('family:defaultMealPlanPersons', 4)
    expect(await getSyncMeta<number>('family:defaultMealPlanPersons')).toBe(4)
  })
})

describe('outbox store', () => {
  function op(overrides: Partial<OutboxOp> = {}): OutboxOp {
    return {
      opId: 'op-1',
      entity: 'recipe',
      type: 'create',
      key: 'r1',
      payload: { name: 'Soup' },
      createdAt: 1,
      attempts: 0,
      ...overrides,
    }
  }

  it('appends ops and returns them in FIFO order with assigned seq', async () => {
    await appendOutboxOp(op({ opId: 'a', key: 'r1' }))
    await appendOutboxOp(op({ opId: 'b', key: 'r2' }))
    const ops = await listOutboxOps()
    expect(ops.map((o) => o.opId)).toEqual(['a', 'b'])
    expect(ops[0].seq).toBeLessThan(ops[1].seq!)
  })

  it('deletes a drained op by its seq', async () => {
    await appendOutboxOp(op({ opId: 'a' }))
    await appendOutboxOp(op({ opId: 'b' }))
    const [first] = await listOutboxOps()
    await deleteOutboxOp(first.seq!)
    const remaining = await listOutboxOps()
    expect(remaining.map((o) => o.opId)).toEqual(['b'])
  })

  it('updates an op in place (parking) without reordering', async () => {
    await appendOutboxOp(op({ opId: 'a' }))
    await appendOutboxOp(op({ opId: 'b' }))
    const [first] = await listOutboxOps()
    await putOutboxOp({ ...first, parkedAt: 99, attempts: 1, lastError: 'bad' })
    const ops = await listOutboxOps()
    expect(ops.map((o) => o.opId)).toEqual(['a', 'b'])
    expect(ops[0].parkedAt).toBe(99)
    expect(await countOutboxOps()).toBe(2)
  })

  it('notifies outbox subscribers on append', async () => {
    const callback = vi.fn()
    const unsubscribe = subscribeLocal(['outbox'], callback)
    await appendOutboxOp(op())
    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

describe('change notifications', () => {
  it('notifies subscribers of matching stores after the write commits', async () => {
    const seen: string[] = []
    const unsubscribe = subscribeLocal(['recipes'], () => {
      // Read inside the callback to prove the write is already visible.
      seen.push('recipes')
    })
    await putLocalRecipe(recipe('r1', 'Soup'))
    expect(seen).toEqual(['recipes'])
    expect(await getLocalRecipe('r1')).not.toBeNull()
    unsubscribe()
    await putLocalRecipe(recipe('r2', 'Stew'))
    expect(seen).toEqual(['recipes'])
  })

  it('does not notify subscribers of other stores', async () => {
    const callback = vi.fn()
    const unsubscribe = subscribeLocal(['mealPlans'], callback)
    await putLocalRecipe(recipe('r1', 'Soup'))
    expect(callback).not.toHaveBeenCalled()
    await putLocalMealPlan('2026-W28', { weekIdentifier: '2026-W28', assignments: [] })
    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
