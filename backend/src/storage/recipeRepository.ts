import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { RecipeDoc, RecipeResponse } from "../domain/types.js";

export interface FindAllOptions {
  nameQuery?: string;
  tagQuery?: string;
}

export class RecipeRepository {
  constructor(private readonly db: Db) {}

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom("recipes")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async findAll(familyId: string, options: FindAllOptions = {}): Promise<RecipeResponse[]> {
    let query = this.db
      .selectFrom("recipes")
      .select(["id", "doc"])
      .where("family_id", "=", familyId);

    if (options.nameQuery?.trim()) {
      query = query.where(sql<boolean>`doc->>'name' ilike ${`%${options.nameQuery}%`}`);
    }
    if (options.tagQuery?.trim()) {
      // Cast to text: node-postgres binds params as `unknown`, which would make
      // jsonb_build_array's polymorphic type undeterminable.
      query = query.where(sql<boolean>`doc->'tags' @> jsonb_build_array(${options.tagQuery}::text)`);
    }

    const rows = await query.orderBy(sql`doc->>'name'`).execute();
    return rows.map((r) => ({ id: r.id, doc: r.doc }));
  }

  async findById(familyId: string, id: string): Promise<RecipeDoc | undefined> {
    const row = await this.db
      .selectFrom("recipes")
      .select("doc")
      .where("id", "=", id)
      .where("family_id", "=", familyId)
      .executeTakeFirst();
    return row?.doc;
  }

  async findByIds(familyId: string, ids: string[]): Promise<RecipeResponse[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom("recipes")
      .select(["id", "doc"])
      .where("family_id", "=", familyId)
      .where("id", "in", ids)
      .execute();
    return rows.map((r) => ({ id: r.id, doc: r.doc }));
  }

  async insert(familyId: string, doc: RecipeDoc): Promise<string> {
    const row = await this.db
      .insertInto("recipes")
      .values({ family_id: familyId, doc: JSON.stringify(doc) })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async update(familyId: string, id: string, doc: RecipeDoc): Promise<boolean> {
    const result = await this.db
      .updateTable("recipes")
      .set({ doc: JSON.stringify(doc), updated_at: new Date() })
      .where("id", "=", id)
      .where("family_id", "=", familyId)
      .executeTakeFirstOrThrow();
    return result.numUpdatedRows > 0n;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("recipes")
      .where("id", "=", id)
      .where("family_id", "=", familyId)
      .executeTakeFirstOrThrow();
    return result.numDeletedRows > 0n;
  }

  /** Distinct tags matching a prefix across the family's recipes (excluding one recipe). */
  async suggestTags(
    familyId: string,
    prefix: string,
    excludeRecipeId?: string,
    limit = 20,
  ): Promise<string[]> {
    const trimmed = prefix.trim();
    if (!trimmed) return [];
    const exclude = excludeRecipeId ?? null;
    const result = await sql<{ tag: string }>`
      SELECT DISTINCT t.tag AS tag
      FROM recipes r
      CROSS JOIN LATERAL jsonb_array_elements_text(r.doc->'tags') AS t(tag)
      WHERE r.family_id = ${familyId}
        AND (${exclude}::uuid IS NULL OR r.id <> ${exclude}::uuid)
        AND t.tag ILIKE ${`${trimmed}%`}
      ORDER BY t.tag
      LIMIT ${limit}
    `.execute(this.db);
    return result.rows.map((r) => r.tag);
  }
}
