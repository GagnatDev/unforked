// Domain document and response shapes, ported 1:1 from the Kotlin `domain`
// package. These are the JSON shapes persisted in JSONB columns and returned
// over the wire; the public API contract must not change.

export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface RecipeDoc {
  name: string;
  description: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
  ingredients: Ingredient[];
  steps: string[];
  servings: number;
  tags: string[];
}

export interface RecipeResponse {
  id: string;
  doc: RecipeDoc;
}

export interface ImportRecipeResponse {
  doc: RecipeDoc;
  warnings: string[];
}

export interface DayAssignment {
  day: string;
  recipeId: string;
  recipeName: string;
  persons?: number | null;
}

export interface MealPlanDoc {
  weekIdentifier: string;
  defaultPersons?: number | null;
  assignments: DayAssignment[];
}

export interface ShoppingListItem {
  name: string;
  quantity: string;
  unit: string;
  recipeIds: string[];
}

export interface ShoppingListDoc {
  weekIdentifier: string;
  items: ShoppingListItem[];
}

/** Store sections used to group the shopping list, in store-walk order. */
export type ShoppingCategory =
  | "produce"
  | "bakery"
  | "meat"
  | "fish"
  | "dairy"
  | "frozen"
  | "pantry"
  | "beverages"
  | "household"
  | "other";

/**
 * A persisted shopping-list item. Extends the frozen ShoppingListItem wire
 * shape additively, so responses remain a valid superset of ShoppingListDoc.
 * Manual (user-added) items have recipeIds: [] and survive meal-plan syncs.
 */
export interface ShoppingListEntry extends ShoppingListItem {
  id: string;
  category: ShoppingCategory;
  checked: boolean;
  manual: boolean;
}

export interface PersistedShoppingListDoc {
  weekIdentifier: string;
  items: ShoppingListEntry[];
}

export interface UserInfo {
  id: string;
  email: string;
  role: string;
  familyId: string;
}

export interface FamilyMemberDto {
  id: string;
  email: string;
}

export interface PendingInviteDto {
  id: string;
  inviteeEmail: string;
  token: string;
  expiresAt: string;
}

export interface FamilyResponse {
  id: string;
  defaultMealPlanPersons: number;
  members: FamilyMemberDto[];
  pendingInvites: PendingInviteDto[];
}
