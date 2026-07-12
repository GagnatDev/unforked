import type { ShoppingCategory, ShoppingListEntry } from '@/types'

/** Store-walk order, mirroring the backend's SHOPPING_CATEGORY_ORDER. */
export const SHOPPING_CATEGORY_ORDER: readonly ShoppingCategory[] = [
  'produce',
  'bakery',
  'meat',
  'fish',
  'dairy',
  'frozen',
  'pantry',
  'beverages',
  'household',
  'other',
]

export interface CategoryGroup {
  category: ShoppingCategory
  items: ShoppingListEntry[]
  checkedCount: number
}

/**
 * Group items by category in store-walk order, items name-sorted within each
 * group. Empty categories are skipped; unknown categories land in "other".
 */
export function groupItemsByCategory(items: ShoppingListEntry[]): CategoryGroup[] {
  const byCategory = new Map<ShoppingCategory, ShoppingListEntry[]>()
  for (const item of items) {
    const category = SHOPPING_CATEGORY_ORDER.includes(item.category) ? item.category : 'other'
    const list = byCategory.get(category)
    if (list) {
      list.push(item)
    } else {
      byCategory.set(category, [item])
    }
  }

  return SHOPPING_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map(
    (category) => {
      const groupItems = byCategory
        .get(category)!
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
      return {
        category,
        items: groupItems,
        checkedCount: groupItems.filter((i) => i.checked).length,
      }
    },
  )
}
