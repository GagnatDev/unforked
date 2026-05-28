import type { Db } from "../db/kysely.js";

export interface FamilyRow {
  id: string;
  default_meal_plan_persons: number;
}

export class FamilyRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): Promise<FamilyRow | undefined> {
    return this.db
      .selectFrom("families")
      .select(["id", "default_meal_plan_persons"])
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async updateDefaultMealPlanPersons(id: string, value: number): Promise<boolean> {
    const result = await this.db
      .updateTable("families")
      .set({ default_meal_plan_persons: value })
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    return result.numUpdatedRows > 0n;
  }

  /** Delete the family only if it has no remaining members. */
  async deleteIfEmpty(familyId: string): Promise<boolean> {
    const members = await this.db
      .selectFrom("users")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("family_id", "=", familyId)
      .executeTakeFirstOrThrow();
    if (Number(members.count) > 0) return false;
    const result = await this.db
      .deleteFrom("families")
      .where("id", "=", familyId)
      .executeTakeFirstOrThrow();
    return result.numDeletedRows > 0n;
  }
}
