import { sql } from "kysely";
import type { HomectlImportConfig } from "../config/env.js";
import { normalizeRole } from "../auth/auth.js";
import type { Db } from "../db/kysely.js";
import { UserRepository } from "../storage/userRepository.js";

/** Flag row id in auth_migration marking the import as done. */
export const IMPORT_FLAG_ID = "homectl-user-import";

/** Arbitrary app-wide advisory-lock key serializing the import across replicas. */
const IMPORT_LOCK_KEY = 7201_4201;

/** Stay well below homectl-auth's 1 MB ingress body cap even for large user sets. */
const BATCH_SIZE = 200;

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  invalid: number;
  withoutPassword: number;
}

interface ImportResponseBody {
  summary?: { created?: number; skipped?: number; invalid?: number };
  results?: { email?: string; status?: string; reason?: string }[];
}

/**
 * One-time seeding of this app's existing accounts into homectl-auth, per the
 * homectl-auth README ("Migrating existing users into homectl-auth"): bcrypt
 * hashes are sent as-is (both sides use bcryptjs cost 12), so users keep their
 * passwords; homectl-auth dedupes on email, making a re-run harmless.
 *
 * Runs exactly once: completion is recorded in auth_migration, and a Postgres
 * advisory lock serializes racing replicas. On any failure nothing is recorded
 * and the boot fails, so the next start retries the import.
 */
export async function importUsersToHomectlOnce(
  db: Db,
  config: HomectlImportConfig,
  log: (msg: string) => void = () => {},
): Promise<ImportSummary | null> {
  const alreadyDone = await db
    .selectFrom("auth_migration")
    .select("id")
    .where("id", "=", IMPORT_FLAG_ID)
    .executeTakeFirst();
  if (alreadyDone) return null;

  return db.transaction().execute(async (trx) => {
    // Serialize concurrent boots; released automatically at commit/rollback.
    await sql`SELECT pg_advisory_xact_lock(${sql.lit(IMPORT_LOCK_KEY)})`.execute(trx);
    const rechecked = await trx
      .selectFrom("auth_migration")
      .select("id")
      .where("id", "=", IMPORT_FLAG_ID)
      .executeTakeFirst();
    if (rechecked) return null;

    const allUsers = await new UserRepository(trx).listAll();
    // Users without a stored hash (sidecar-provisioned) already live in homectl-auth.
    const importable = allUsers.filter(
      (u): u is typeof u & { password_hash: string } => u.password_hash !== null,
    );

    const summary: ImportSummary = {
      total: allUsers.length,
      created: 0,
      skipped: 0,
      invalid: 0,
      withoutPassword: allUsers.length - importable.length,
    };

    log(`homectl-auth import: sending ${importable.length} of ${allUsers.length} users`);
    for (let offset = 0; offset < importable.length; offset += BATCH_SIZE) {
      const batch = importable.slice(offset, offset + BATCH_SIZE);
      const body = await postImportBatch(config, batch);
      tally(summary, batch.length, body, log);
    }

    await trx
      .insertInto("auth_migration")
      .values({ id: IMPORT_FLAG_ID, summary: JSON.stringify(summary) })
      .execute();
    log(
      `homectl-auth import complete: ${summary.created} created, ` +
        `${summary.skipped} skipped, ${summary.invalid} invalid`,
    );
    return summary;
  });
}

async function postImportBatch(
  config: HomectlImportConfig,
  batch: { email: string; password_hash: string; role: string }[],
): Promise<ImportResponseBody> {
  const res = await fetch(`${config.internalAuthUrl}/internal/users/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      users: batch.map((u) => ({
        email: u.email,
        username: u.email.split("@")[0],
        passwordHash: u.password_hash,
        role: normalizeRole(u.role),
      })),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `homectl-auth user import failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 500)}` : ""}`,
    );
  }
  return (await res.json()) as ImportResponseBody;
}

/** Fold one batch response into the running summary, logging rejected entries. */
function tally(
  summary: ImportSummary,
  batchSize: number,
  body: ImportResponseBody,
  log: (msg: string) => void,
): void {
  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length > 0) {
    for (const r of results) {
      if (r.status === "created") summary.created += 1;
      else if (r.status === "invalid") {
        summary.invalid += 1;
        log(`homectl-auth import: entry rejected (${r.email ?? "?"}): ${r.reason ?? "invalid"}`);
      } else summary.skipped += 1;
    }
    return;
  }
  // No per-entry results — fall back to the summary block, then to batch size.
  summary.created += body.summary?.created ?? batchSize;
  summary.skipped += body.summary?.skipped ?? 0;
  summary.invalid += body.summary?.invalid ?? 0;
}
