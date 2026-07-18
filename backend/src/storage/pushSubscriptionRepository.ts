import type { Db } from "../db/kysely.js";

export interface PushSubscriptionRow {
  id: string;
  created_at: Date;
  user_id: string;
  family_id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  locale: string;
  user_agent: string | null;
  last_used_at: Date | null;
  failed_at: Date | null;
}

const PUSH_SUBSCRIPTION_COLUMNS = [
  "id",
  "created_at",
  "user_id",
  "family_id",
  "endpoint",
  "keys_p256dh",
  "keys_auth",
  "locale",
  "user_agent",
  "last_used_at",
  "failed_at",
] as const;

export class PushSubscriptionRepository {
  constructor(private readonly db: Db) {}

  /**
   * Insert or refresh a subscription, keyed on the endpoint (design #104 D5).
   * A browser re-subscribing (new keys, changed locale, or the account now
   * signed in on this device) replaces the old row's material in place, and a
   * previous delivery failure is forgiven.
   */
  upsertByEndpoint(input: {
    userId: string;
    familyId: string;
    endpoint: string;
    keysP256dh: string;
    keysAuth: string;
    locale: string;
    userAgent?: string;
  }): Promise<PushSubscriptionRow> {
    return this.db
      .insertInto("push_subscriptions")
      .values({
        user_id: input.userId,
        family_id: input.familyId,
        endpoint: input.endpoint,
        keys_p256dh: input.keysP256dh,
        keys_auth: input.keysAuth,
        locale: input.locale,
        user_agent: input.userAgent ?? null,
      })
      .onConflict((oc) =>
        oc.column("endpoint").doUpdateSet({
          user_id: input.userId,
          family_id: input.familyId,
          keys_p256dh: input.keysP256dh,
          keys_auth: input.keysAuth,
          locale: input.locale,
          user_agent: input.userAgent ?? null,
          failed_at: null,
        }),
      )
      .returning(PUSH_SUBSCRIPTION_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  listByUser(userId: string): Promise<PushSubscriptionRow[]> {
    return this.db
      .selectFrom("push_subscriptions")
      .select(PUSH_SUBSCRIPTION_COLUMNS)
      .where("user_id", "=", userId)
      .orderBy("created_at", "asc")
      .execute();
  }

  /**
   * Delete the caller's subscription for an endpoint. Scoped to the user so
   * one account can never unsubscribe another's device; idempotent (returns
   * false when nothing matched).
   */
  async deleteByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("push_subscriptions")
      .where("user_id", "=", userId)
      .where("endpoint", "=", endpoint)
      .executeTakeFirstOrThrow();
    return result.numDeletedRows > 0n;
  }

  /** Prune a dead endpoint (push service answered 404/410 — design #104 D5). */
  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom("push_subscriptions").where("id", "=", id).execute();
  }

  /** Record a successful delivery so stale subscriptions are visible. */
  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .updateTable("push_subscriptions")
      .set({ last_used_at: new Date() })
      .where("id", "=", id)
      .execute();
  }

  /** Record a (non-fatal) delivery failure; cleared again on the next success/upsert. */
  async markFailed(id: string): Promise<void> {
    await this.db
      .updateTable("push_subscriptions")
      .set({ failed_at: new Date() })
      .where("id", "=", id)
      .execute();
  }
}
