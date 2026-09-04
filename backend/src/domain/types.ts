// Domain document and response shapes, ported 1:1 from the Kotlin `domain`
// package. These are the JSON shapes persisted in JSONB columns and returned
// over the wire; the public API contract must not change.

export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

/**
 * Bucket object keys for a recipe's photo. Additive and optional so legacy
 * docs stay valid. Managed exclusively by the photo endpoints — regular
 * recipe writes cannot set it, and the stored value survives doc updates.
 */
export interface RecipePhoto {
  /** Object key of the full-size (client-compressed) photo. */
  key: string;
  /** Object key of the small thumbnail rendered in the recipes list. */
  thumbKey: string;
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
  photo?: RecipePhoto | null;
}

export interface RecipeResponse {
  id: string;
  doc: RecipeDoc;
  /** Optimistic-concurrency version (offline-first A5). Absent on legacy shapes. */
  version?: number;
}

/**
 * Result of an optimistic-concurrency write. `updated` carries the new version;
 * `conflict` carries the server's current doc + version so the client can merge
 * and retry; `notFound` means the target row does not exist for this family.
 */
export type ConcurrentWriteResult<TDoc> =
  | {
      status: "updated";
      version: number;
      /** The doc as persisted, when the store normalizes it (e.g. recipes keep their photo). */
      doc?: TDoc;
    }
  | { status: "conflict"; doc: TDoc; version: number }
  | { status: "notFound" };

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

/**
 * One meal-plan assignment that contributed to an aggregated item: the day
 * and the recipe planned for it. Completing a shopping trip records these on
 * the archived items so the sync stops regenerating exactly what was bought,
 * while a later recipe on the same day (or the same recipe on another day)
 * still shows up on the open list.
 */
export interface ItemSource {
  day: string;
  recipeId: string;
}

export interface ShoppingListItem {
  name: string;
  quantity: string;
  unit: string;
  recipeIds: string[];
  /** Additive: the (day, recipe) pairs behind a recipe-derived item. Absent on manual items. */
  sources?: ItemSource[];
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

/**
 * State of the week's *open* list (the items still to buy). Absent on the doc
 * means "open" (back-compat). `ready` = whoever plans has finished adding and
 * the list can be shopped by anyone; `approved` = someone has claimed the trip
 * and is shopping now. Completing a trip returns the list to open.
 */
export type ShoppingListStatus = "open" | "ready" | "approved";

/**
 * A completed shopping trip: the items that were checked when a member
 * pressed "Shopping done", moved out of the open list so the week can be
 * shopped in several rounds. Recipe-derived items carry their `sources`, which
 * the sync uses to stop regenerating what has already been bought.
 */
export interface ShoppingTrip {
  id: string;
  /** ISO timestamp of completion (client-minted for offline completes). */
  completedAt: string;
  /** User id of the member who completed the trip. */
  completedBy: string;
  /** Their email, denormalized for display without a join. */
  completedByEmail: string;
  items: ShoppingListEntry[];
}

export interface PersistedShoppingListDoc {
  weekIdentifier: string;
  /** The open list: what is still to buy this week. */
  items: ShoppingListEntry[];
  /**
   * Approved / "shopping now" state (design #104 D4). All four fields are
   * additive and optional so legacy docs and responses stay valid; a new week
   * starts with none of them (= open). Set together on approval, cleared
   * together on reopen or trip completion.
   */
  status?: ShoppingListStatus;
  /** User id of the member who approved the list. */
  approvedBy?: string;
  /** Approver's email, denormalized for display without a join. */
  approvedByEmail?: string;
  /** ISO timestamp of the approval. */
  approvedAt?: string;
  /** Who marked the list ready to shop, and when. Set together; cleared on any other transition. */
  readyBy?: string;
  readyByEmail?: string;
  readyAt?: string;
  /** Completed trips this week, oldest first. Absent or empty until the first "Shopping done". */
  trips?: ShoppingTrip[];
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
