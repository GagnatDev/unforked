import { describe, expect, it } from 'vitest'
import type { ShoppingListEntry } from '@/types'
import { groupItemsByCategory } from './shoppingCategories'

function entry(overrides: Partial<ShoppingListEntry>): ShoppingListEntry {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Milk',
    quantity: '1',
    unit: 'l',
    recipeIds: [],
    category: 'dairy',
    checked: false,
    manual: false,
    ...overrides,
  }
}

describe('groupItemsByCategory', () => {
  it('groups in store-walk order and skips empty categories', () => {
    const groups = groupItemsByCategory([
      entry({ name: 'Coffee', category: 'beverages' }),
      entry({ name: 'Carrot', category: 'produce' }),
      entry({ name: 'Chicken', category: 'meat' }),
    ])
    expect(groups.map((g) => g.category)).toEqual(['produce', 'meat', 'beverages'])
  })

  it('sorts items by name within a group and counts checked items', () => {
    const groups = groupItemsByCategory([
      entry({ name: 'Tomato', category: 'produce', checked: true }),
      entry({ name: 'Basil', category: 'produce' }),
      entry({ name: 'Onion', category: 'produce', checked: true }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => i.name)).toEqual(['Basil', 'Onion', 'Tomato'])
    expect(groups[0].checkedCount).toBe(2)
  })

  it('sends unknown categories to other', () => {
    const groups = groupItemsByCategory([
      entry({ name: 'Mystery', category: 'not-a-category' as ShoppingListEntry['category'] }),
    ])
    expect(groups.map((g) => g.category)).toEqual(['other'])
  })

  it('returns no groups for an empty list', () => {
    expect(groupItemsByCategory([])).toEqual([])
  })
})
