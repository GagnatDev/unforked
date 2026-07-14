import type { ColumnType, Generated } from "kysely";
import type { MealPlanDoc, PersistedShoppingListDoc, RecipeDoc } from "../domain/types.js";

// JSONB columns: node-postgres parses them to objects on read; we write a
// JSON-stringified value (text → jsonb cast) — hence the string insert/update type.
type JsonColumn<T> = ColumnType<T, string, string>;

// Defaulted timestamps: selected as Date, never written by app code.
type DefaultTimestamp = ColumnType<Date, never, never>;
// Like DefaultTimestamp but app code may set it on update (e.g. updated_at = now()).
type UpdatableTimestamp = ColumnType<Date, never, Date | string>;

export interface RecipesTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  updated_at: UpdatableTimestamp;
  doc: JsonColumn<RecipeDoc>;
  family_id: string;
  // Optimistic-concurrency counter; defaulted on insert, bumped on update.
  version: Generated<number>;
}

export interface MealPlansTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  updated_at: UpdatableTimestamp;
  doc: JsonColumn<MealPlanDoc>;
  family_id: string;
  version: Generated<number>;
}

export interface ShoppingListsTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  updated_at: UpdatableTimestamp;
  doc: JsonColumn<PersistedShoppingListDoc>;
  family_id: string;
  version: Generated<number>;
}

/** Per-family ingredient -> store-category overrides (normalized names). */
export interface IngredientCategoriesTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  updated_at: UpdatableTimestamp;
  family_id: string;
  ingredient_name: string;
  category: string;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  /** Legacy bcrypt hash; null for users provisioned from the auth sidecar. */
  password_hash: string | null;
  role: Generated<string>;
  created_at: DefaultTimestamp;
  family_id: string;
}

export interface FamiliesTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  default_meal_plan_persons: Generated<number>;
}

export interface FamilyInvitationsTable {
  id: Generated<string>;
  family_id: string;
  inviter_user_id: string;
  invitee_email: string;
  token: string;
  status: Generated<string>;
  created_at: DefaultTimestamp;
  expires_at: ColumnType<Date, Date, Date>;
}

/** Per-user machine-API keys; only the SHA-256 hash of the key is stored. */
export interface ApiKeysTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  user_id: string;
  name: string;
  key_hash: string;
  scopes: Generated<string[]>;
  last_used_at: ColumnType<Date | null, never, Date | string>;
  expires_at: ColumnType<Date | null, Date | string | null, never>;
  revoked_at: ColumnType<Date | null, never, Date | string>;
}

/** One-time auth-migration steps; a row per completed step (see 004 migration). */
export interface AuthMigrationTable {
  id: string;
  completed_at: DefaultTimestamp;
  summary: ColumnType<unknown, string | null, never>;
}

export interface Database {
  api_keys: ApiKeysTable;
  recipes: RecipesTable;
  meal_plans: MealPlansTable;
  shopping_lists: ShoppingListsTable;
  ingredient_categories: IngredientCategoriesTable;
  users: UsersTable;
  families: FamiliesTable;
  family_invitations: FamilyInvitationsTable;
  auth_migration: AuthMigrationTable;
}
