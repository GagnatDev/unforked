export interface Ingredient {
  name: string
  quantity: string
  unit: string
}

/**
 * Bucket object keys for a recipe's photo. Server-managed: set via the photo
 * endpoints only; regular recipe saves cannot change it (the backend strips
 * and re-attaches the stored value on every doc write).
 */
export interface RecipePhoto {
  /** Object key of the full-size (compressed) photo. */
  key: string
  /** Object key of the small thumbnail rendered in the recipes list. */
  thumbKey: string
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
  photo?: RecipePhoto | null
}

export interface Recipe {
  id: string
  doc: RecipeDoc
  /** Optimistic-concurrency version from the server (offline-first A5). */
  version?: number
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

/** Trip state of a weekly list. Absent on the doc means "open" (back-compat). */
export type ShoppingListStatus = 'open' | 'approved'

export interface PersistedShoppingListDoc {
  weekIdentifier: string
  items: ShoppingListEntry[]
  /** Optimistic-concurrency version of the list row (offline-first A5). */
  version?: number
  /**
   * Approved / "shopping now" state (design #104 D4): set together on
   * approval, cleared together on reopen. All optional so legacy docs stay valid.
   */
  status?: ShoppingListStatus
  /** User id of the member who approved the list. */
  approvedBy?: string
  /** Approver's email, denormalized for display. */
  approvedByEmail?: string
  /** ISO timestamp of the approval. */
  approvedAt?: string
}

/** A machine-API key as listed by GET /api/api-keys (never the secret itself). */
export interface ApiKey {
  id: string
  name: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}
