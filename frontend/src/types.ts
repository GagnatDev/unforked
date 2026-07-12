export interface Ingredient {
  name: string
  quantity: string
  unit: string
}

export interface RecipeDoc {
  name: string
  description: string
  sourceUrl: string | null
  sourceName: string | null
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  tags: string[]
}

export interface Recipe {
  id: string
  doc: RecipeDoc
}

export interface DayAssignment {
  day: string
  recipeId: string
  recipeName: string
  persons?: number | null
}

export interface MealPlanDoc {
  weekIdentifier: string
  defaultPersons?: number | null
  assignments: DayAssignment[]
}

export interface ShoppingListItem {
  name: string
  quantity: string
  unit: string
  recipeIds: string[]
}

export interface ShoppingListDoc {
  weekIdentifier: string
  items: ShoppingListItem[]
}

/** Store sections used to group the shopping list, in store-walk order. */
export type ShoppingCategory =
  | 'produce'
  | 'bakery'
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'frozen'
  | 'pantry'
  | 'beverages'
  | 'household'
  | 'other'

/** Persisted shopping-list item; manual entries are user-added (recipeIds: []). */
export interface ShoppingListEntry extends ShoppingListItem {
  id: string
  category: ShoppingCategory
  checked: boolean
  manual: boolean
}

export interface PersistedShoppingListDoc {
  weekIdentifier: string
  items: ShoppingListEntry[]
}
