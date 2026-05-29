import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { MealPlanDoc } from "../domain/types.js";

export class MealPlanRepository {
  constructor(private readonly db: Db) {}

  async findByWeek(familyId: string, weekIdentifier: string): Promise<MealPlanDoc | undefined> {
    const row = await this.db
      .selectFrom("meal_plans")
      .select("doc")
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' = ${weekIdentifier}`)
      .executeTakeFirst();
    return row?.doc;
  }

  /** Insert or replace the meal plan for the doc's week (one plan per family/week). */
  async upsert(familyId: string, doc: MealPlanDoc): Promise<void> {
    const existing = await this.db
      .selectFrom("meal_plans")
      .select("id")
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' = ${doc.weekIdentifier}`)
      .executeTakeFirst();

    if (existing) {
      await this.db
        .updateTable("meal_plans")
        .set({ doc: JSON.stringify(doc), updated_at: new Date() })
        .where("id", "=", existing.id)
        .execute();
      return;
    }
    await this.db
      .insertInto("meal_plans")
      .values({ family_id: familyId, doc: JSON.stringify(doc) })
      .execute();
  }
}
