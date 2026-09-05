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

/** One planned (day, recipe) behind a recipe-derived item; recorded on archived trips. */
export interface ItemSource {
  day: string
  recipeId: string
}

export interface ShoppingListItem {
  name: string
  quantity: string
  unit: string
  recipeIds: string[]
  sources?: ItemSource[]
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

/**
 * State of the week's open list. Absent on the doc means "open" (back-compat).
 * `ready` = the planner has finished adding, anyone can shop it; `approved` =
 * someone claimed the trip and is shopping now.
 */
export type ShoppingListStatus = 'open' | 'ready' | 'approved'

/**
 * A completed shopping trip: what was checked when "Shopping done" was
 * pressed, moved out of the open list. A week can hold any number of them.
 */
export interface ShoppingTrip {
  id: string
  completedAt: string
  completedBy: string
  completedByEmail: string
  items: ShoppingListEntry[]
}

export interface PersistedShoppingListDoc {
  weekIdentifier: string
  /** The open list: still to buy this week. */
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
  /** Who marked the list ready, and when; cleared on any other transition. */
  readyBy?: string
  readyByEmail?: string
  readyAt?: string
  /** Completed trips this week, oldest first. */
  trips?: ShoppingTrip[]
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
