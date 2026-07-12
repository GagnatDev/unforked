import type { Db } from "../db/kysely.js";
import { SHOPPING_CATEGORIES } from "../domain/ingredientCategories.js";
import type { ShoppingCategory } from "../domain/types.js";

const VALID_CATEGORIES = new Set<string>(SHOPPING_CATEGORIES);

/**
 * Per-family ingredient -> store-category overrides, keyed by normalized
 * ingredient name (see normalizeIngredientName). Applied before the keyword
 * categorizer so a family's corrections stick for all future lists.
 */
export class IngredientCategoryRepository {
  constructor(private readonly db: Db) {}

  async findAllForFamily(familyId: string): Promise<Map<string, ShoppingCategory>> {
    const rows = await this.db
      .selectFrom("ingredient_categories")
      .select(["ingredient_name", "category"])
      .where("family_id", "=", familyId)
      .execute();
    const map = new Map<string, ShoppingCategory>();
    for (const row of rows) {
      if (VALID_CATEGORIES.has(row.category)) {
        map.set(row.ingredient_name, row.category as ShoppingCategory);
      }
    }
    return map;
  }

  async upsert(
    familyId: string,
    ingredientName: string,
    category: ShoppingCategory,
    executor: Db = this.db,
  ): Promise<void> {
    await executor
      .insertInto("ingredient_categories")
      .values({ family_id: familyId, ingredient_name: ingredientName, category })
      .onConflict((oc) =>
        oc
          .columns(["family_id", "ingredient_name"])
          .doUpdateSet({ category, updated_at: new Date() }),
      )
      .execute();
  }
}
