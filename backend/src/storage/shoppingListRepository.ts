import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { PersistedShoppingListDoc } from "../domain/types.js";

export interface ShoppingListRow {
  id: string;
  doc: PersistedShoppingListDoc;
  version: number;
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
      .select(["id", "doc", "version"])
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

  /**
   * Write back a list doc. `bumpVersion` is set only by genuine item mutations
   * (offline-first A5) so a stale client PATCH is caught by the version
   * precondition; sync-on-read rewrites must NOT bump it, or every read would
   * invalidate every client's baseVersion.
   */
  async updateDoc(
    executor: Db,
    id: string,
    doc: PersistedShoppingListDoc,
    options: { bumpVersion?: boolean } = {},
  ): Promise<void> {
    await executor
      .updateTable("shopping_lists")
      .set({
        doc: JSON.stringify(doc),
        updated_at: new Date(),
        ...(options.bumpVersion ? { version: sql`version + 1` } : {}),
      })
      .where("id", "=", id)
      .execute();
  }
}
