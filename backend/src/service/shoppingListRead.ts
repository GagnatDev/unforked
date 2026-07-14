import type { Db } from "../db/kysely.js";
import type { PersistedShoppingListDoc } from "../domain/types.js";
import { buildAggregatedShoppingItems, type RecipeEntry } from "./shoppingListService.js";
import { syncShoppingListDoc } from "./shoppingListSync.js";
import { IngredientCategoryRepository } from "../storage/ingredientCategoryRepository.js";
import { MealPlanRepository } from "../storage/mealPlanRepository.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { ShoppingListRepository } from "../storage/shoppingListRepository.js";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Sync-on-read for a week's shopping list, shared by the human API and the
 * machine API so both see the identical persisted state (check-offs, category
 * choices, manual items). Syncs the stored doc with the current meal plan and
 * writes it back inside a transaction; the row lock serializes against item
 * mutations. Creates no row for empty, casually browsed weeks.
 */
export interface SyncedShoppingList {
  doc: PersistedShoppingListDoc;
  /** Current optimistic-concurrency version of the stored row (0 when none). */
  version: number;
}

export async function loadSyncedShoppingList(
  db: Db,
  familyId: string,
  weekId: string,
): Promise<SyncedShoppingList> {
  const mealPlans = new MealPlanRepository(db);
  const recipes = new RecipeRepository(db);
  const shoppingLists = new ShoppingListRepository(db);
  const ingredientCategories = new IngredientCategoryRepository(db);

  const found = await mealPlans.findByWeek(familyId, weekId);
  const plan = found?.doc;
  let aggregate: ReturnType<typeof buildAggregatedShoppingItems> = [];
  if (plan) {
    const distinctIds = [...new Set(plan.assignments.map((a) => a.recipeId))];
    const found = await recipes.findByIds(familyId, distinctIds);
    const recipeById = new Map<string, RecipeEntry>(found.map((r) => [r.id, r]));
    aggregate = buildAggregatedShoppingItems(plan, recipeById);
  }
  const overrides = await ingredientCategories.findAllForFamily(familyId);

  return db.transaction().execute(async (trx) => {
    const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
    const merged = syncShoppingListDoc(row?.doc, aggregate, overrides, weekId);
    if (row) {
      // Sync-on-read must not bump the version (see updateDoc): it is not a
      // client edit, and bumping would 409 every concurrent client's writes.
      await shoppingLists.updateDoc(trx, row.id, merged);
      return { doc: merged, version: row.version };
    }
    if (merged.items.length > 0) {
      // Don't create rows for casually browsed empty weeks.
      await shoppingLists.insert(trx, familyId, merged);
    }
    return { doc: merged, version: 0 };
  });
}

/**
 * loadSyncedShoppingList with the first-GET insert race handled: two concurrent
 * first reads of the same week can race on the unique (family, week) index; the
 * loser retries once and takes the update path.
 */
export async function getSyncedShoppingList(
  db: Db,
  familyId: string,
  weekId: string,
): Promise<SyncedShoppingList> {
  try {
    return await loadSyncedShoppingList(db, familyId, weekId);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return loadSyncedShoppingList(db, familyId, weekId);
  }
}
