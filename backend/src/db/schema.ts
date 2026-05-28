import type { ColumnType, Generated } from "kysely";
import type { MealPlanDoc, RecipeDoc } from "../domain/types.js";

// JSONB columns: node-postgres parses them to objects on read; we write a
// JSON-stringified value (text → jsonb cast) — hence the string insert/update type.
type JsonColumn<T> = ColumnType<T, string, string>;

// Defaulted timestamps: selected as Date, never written by app code.
type DefaultTimestamp = ColumnType<Date, never, never>;

export interface RecipesTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
  doc: JsonColumn<RecipeDoc>;
  family_id: string;
}

export interface MealPlansTable {
  id: Generated<string>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
  doc: JsonColumn<MealPlanDoc>;
  family_id: string;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
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

export interface Database {
  recipes: RecipesTable;
  meal_plans: MealPlansTable;
  users: UsersTable;
  families: FamiliesTable;
  family_invitations: FamilyInvitationsTable;
}
