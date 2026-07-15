import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { ConcurrentWriteResult, MealPlanDoc } from "../domain/types.js";

export class MealPlanRepository {
  constructor(private readonly db: Db) {}

  async findByWeek(
    familyId: string,
    weekIdentifier: string,
  ): Promise<{ doc: MealPlanDoc; version: number } | undefined> {
    const row = await this.db
      .selectFrom("meal_plans")
      .select(["doc", "version"])
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' = ${weekIdentifier}`)
      .executeTakeFirst();
    return row ? { doc: row.doc, version: row.version } : undefined;
  }

  /**
   * Insert or replace the meal plan for the doc's week (one plan per
   * family/week). With a `baseVersion` (offline-first A5) an existing plan is
   * only overwritten when its stored version matches — a mismatch returns the
   * current server doc so the caller can 409 and the sync engine can re-merge
   * changed days. Without one the upsert is unconditional (legacy). A brand-new
   * week is always inserted at version 0.
   */
  async upsert(
    familyId: string,
    doc: MealPlanDoc,
    baseVersion?: number,
  ): Promise<Exclude<ConcurrentWriteResult<MealPlanDoc>, { status: "notFound" }>> {
    const existing = await this.db
      .selectFrom("meal_plans")
      .select(["id", "doc", "version"])
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' = ${doc.weekIdentifier}`)
      .executeTakeFirst();

    if (!existing) {
      await this.db
        .insertInto("meal_plans")
        .values({ family_id: familyId, doc: JSON.stringify(doc) })
        .execute();
      return { status: "updated", version: 0 };
    }

    if (baseVersion !== undefined && existing.version !== baseVersion) {
      return { status: "conflict", doc: existing.doc, version: existing.version };
    }
    const updated = await this.db
      .updateTable("meal_plans")
      .set({ doc: JSON.stringify(doc), updated_at: new Date(), version: sql`version + 1` })
      .where("id", "=", existing.id)
      .returning("version")
      .executeTakeFirstOrThrow();
    return { status: "updated", version: updated.version };
  }
}
