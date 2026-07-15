import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { ConcurrentWriteResult, RecipeDoc, RecipeResponse } from "../domain/types.js";

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
      .select(["id", "doc", "version"])
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
    return rows.map((r) => ({ id: r.id, doc: r.doc, version: r.version }));
  }

  async findById(
    familyId: string,
    id: string,
  ): Promise<{ doc: RecipeDoc; version: number } | undefined> {
    const row = await this.db
      .selectFrom("recipes")
      .select(["doc", "version"])
      .where("id", "=", id)
      .where("family_id", "=", familyId)
      .executeTakeFirst();
    return row ? { doc: row.doc, version: row.version } : undefined;
  }

  async findByIds(familyId: string, ids: string[]): Promise<RecipeResponse[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom("recipes")
      .select(["id", "doc", "version"])
      .where("family_id", "=", familyId)
      .where("id", "in", ids)
      .execute();
    return rows.map((r) => ({ id: r.id, doc: r.doc, version: r.version }));
  }

  /**
   * Insert a recipe. When `id` is supplied (a client-minted UUID for
   * offline-first creates), it is used as the primary key and the insert is
   * idempotent: replaying the same create — e.g. after an offline outbox
   * survives a reload — conflicts on the id and does nothing, so the original
   * row wins. Without an `id` the database mints one as before.
   */
  async insert(
    familyId: string,
    doc: RecipeDoc,
    id?: string,
  ): Promise<{ id: string; version: number }> {
    if (id) {
      const inserted = await this.db
        .insertInto("recipes")
        .values({ id, family_id: familyId, doc: JSON.stringify(doc) })
        .onConflict((oc) => oc.column("id").doNothing())
        .returning(["id", "version"])
        .executeTakeFirst();
      if (inserted) return { id: inserted.id, version: inserted.version };
      // Idempotent replay: the row already existed, so return its current
      // version (the original doc wins — see the doc comment above).
      const existing = await this.findById(familyId, id);
      return { id, version: existing?.version ?? 0 };
    }
    const row = await this.db
      .insertInto("recipes")
      .values({ family_id: familyId, doc: JSON.stringify(doc) })
      .returning(["id", "version"])
      .executeTakeFirstOrThrow();
    return { id: row.id, version: row.version };
  }

  /**
   * Optimistic-concurrency update. Without a `baseVersion` the write is
   * unconditional (preserving legacy single-client behaviour); with one, the
   * update only lands when the stored version matches, bumping it on success.
   * A mismatch returns the current server doc + version so the caller can 409.
   */
  async update(
    familyId: string,
    id: string,
    doc: RecipeDoc,
    baseVersion?: number,
  ): Promise<ConcurrentWriteResult<RecipeDoc>> {
    let update = this.db
      .updateTable("recipes")
      .set({ doc: JSON.stringify(doc), updated_at: new Date(), version: sql`version + 1` })
      .where("id", "=", id)
      .where("family_id", "=", familyId);
    if (baseVersion !== undefined) {
      update = update.where("version", "=", baseVersion);
    }
    const updated = await update.returning("version").executeTakeFirst();
    if (updated) return { status: "updated", version: updated.version };

    // Nothing updated: distinguish a missing row from a version mismatch.
    const current = await this.findById(familyId, id);
    if (!current) return { status: "notFound" };
    return { status: "conflict", doc: current.doc, version: current.version };
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
