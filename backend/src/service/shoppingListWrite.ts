import type { Db } from "../db/kysely.js";
import type { ShoppingCategory, ShoppingListEntry } from "../domain/types.js";
import { IngredientCategoryRepository } from "../storage/ingredientCategoryRepository.js";
import { ShoppingListRepository } from "../storage/shoppingListRepository.js";
import { createManualEntry } from "./shoppingListSync.js";

export interface ManualItemInput {
  name: string;
  quantity: string;
  unit: string;
  category?: ShoppingCategory;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Append one or more manual (user-added) items to a week's persisted shopping
 * list, shared by the human API and the machine API. Items are auto-categorized
 * from the family's overrides unless a category is given. If the week has no
 * list row yet (no plan, never viewed), one is created on the fly; the unique
 * (family, week) index race with a concurrent first write is retried once.
 */
export async function addManualItems(
  db: Db,
  familyId: string,
  weekId: string,
  inputs: ManualItemInput[],
): Promise<ShoppingListEntry[]> {
  const shoppingLists = new ShoppingListRepository(db);
  const ingredientCategories = new IngredientCategoryRepository(db);
  const overrides = await ingredientCategories.findAllForFamily(familyId);

  const insertItems = () =>
    db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const entries = inputs.map((input) => createManualEntry(input, overrides));
      if (row) {
        row.doc.items.push(...entries);
        await shoppingLists.updateDoc(trx, row.id, row.doc);
      } else {
        await shoppingLists.insert(trx, familyId, { weekIdentifier: weekId, items: entries });
      }
      return entries;
    });

  try {
    return await insertItems();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return insertItems();
  }
}
