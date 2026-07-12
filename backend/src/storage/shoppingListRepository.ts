import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { PersistedShoppingListDoc } from "../domain/types.js";

export interface ShoppingListRow {
  id: string;
  doc: PersistedShoppingListDoc;
}

/**
 * Persisted shopping lists: one JSONB doc per family/week (mirrors
 * MealPlanRepository). Methods take an optional executor so callers can run
 * them inside a transaction (row-locked read + write-back).
 */
export class ShoppingListRepository {
  constructor(private readonly db: Db) {}

  async findByWeek(
    familyId: string,
    weekIdentifier: string,
  ): Promise<PersistedShoppingListDoc | undefined> {
    const row = await this.db
      .selectFrom("shopping_lists")
      .select("doc")
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' = ${weekIdentifier}`)
      .executeTakeFirst();
    return row?.doc;
  }

  /** Locked read (SELECT ... FOR UPDATE) — serializes concurrent GET/PATCH writers. */
  async findRowByWeekForUpdate(
    executor: Db,
    familyId: string,
    weekIdentifier: string,
  ): Promise<ShoppingListRow | undefined> {
    return executor
      .selectFrom("shopping_lists")
      .select(["id", "doc"])
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' = ${weekIdentifier}`)
      .forUpdate()
      .executeTakeFirst();
  }

  async insert(executor: Db, familyId: string, doc: PersistedShoppingListDoc): Promise<void> {
    await executor
      .insertInto("shopping_lists")
      .values({ family_id: familyId, doc: JSON.stringify(doc) })
      .execute();
  }

  async updateDoc(executor: Db, id: string, doc: PersistedShoppingListDoc): Promise<void> {
    await executor
      .updateTable("shopping_lists")
      .set({ doc: JSON.stringify(doc), updated_at: new Date() })
      .where("id", "=", id)
      .execute();
  }
}
