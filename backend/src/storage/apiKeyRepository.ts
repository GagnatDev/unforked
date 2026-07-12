import type { Db } from "../db/kysely.js";

export interface ApiKeyRow {
  id: string;
  created_at: Date;
  user_id: string;
  name: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
}

// key_hash is deliberately not selected anywhere: it never leaves the database
// except as the WHERE operand of the verification lookup.
const API_KEY_COLUMNS = [
  "id",
  "created_at",
  "user_id",
  "name",
  "scopes",
  "last_used_at",
  "expires_at",
  "revoked_at",
] as const;

export class ApiKeyRepository {
  constructor(private readonly db: Db) {}

  insert(input: { userId: string; name: string; keyHash: string }): Promise<ApiKeyRow> {
    return this.db
      .insertInto("api_keys")
      .values({ user_id: input.userId, name: input.name, key_hash: input.keyHash })
      .returning(API_KEY_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  listByUser(userId: string): Promise<ApiKeyRow[]> {
    return this.db
      .selectFrom("api_keys")
      .select(API_KEY_COLUMNS)
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .execute();
  }

  /** Verification lookup. Revocation/expiry checks live in the middleware. */
  findByHash(keyHash: string): Promise<ApiKeyRow | undefined> {
    return this.db
      .selectFrom("api_keys")
      .select(API_KEY_COLUMNS)
      .where("key_hash", "=", keyHash)
      .executeTakeFirst();
  }

  /**
   * Revoke a key the given user owns. Idempotent on already-revoked keys;
   * returns false when the key doesn't exist or belongs to someone else.
   */
  async revoke(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .updateTable("api_keys")
      .set({ revoked_at: new Date() })
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .executeTakeFirstOrThrow();
    if (result.numUpdatedRows > 0n) return true;
    const existing = await this.db
      .selectFrom("api_keys")
      .select("id")
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return existing !== undefined;
  }

  /** Track key usage (S6) so stale keys are visible and revocable. */
  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .updateTable("api_keys")
      .set({ last_used_at: new Date() })
      .where("id", "=", id)
      .execute();
  }
}
