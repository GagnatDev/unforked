import type { Db } from "../db/kysely.js";
import { boughtSourceKeys } from "../domain/shoppingItemKey.js";
import type { MealPlanDoc, PersistedShoppingListDoc } from "../domain/types.js";
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
  const plan: MealPlanDoc | undefined = found?.doc;
  let recipeById = new Map<string, RecipeEntry>();
  if (plan) {
    const distinctIds = [...new Set(plan.assignments.map((a) => a.recipeId))];
    const found = await recipes.findByIds(familyId, distinctIds);
    recipeById = new Map<string, RecipeEntry>(found.map((r) => [r.id, r]));
  }
  const overrides = await ingredientCategories.findAllForFamily(familyId);

  return db.transaction().execute(async (trx) => {
    const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
    // Aggregate under the row lock: what the week's completed trips already
    // bought is read from the locked doc, so a concurrent "Shopping done"
    // can't slip between reading the history and regenerating the open list.
    const aggregate = plan
      ? buildAggregatedShoppingItems(plan, recipeById, {
          bought: boughtSourceKeys(row?.doc.trips),
        })
      : [];
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
