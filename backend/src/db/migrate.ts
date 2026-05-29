import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner as migrationRunner } from "node-pg-migrate";
import pg from "pg";

const MIGRATIONS_TABLE = "pgmigrations";

// The Kotlin/Flyway V1–V3 schema is reproduced exactly by 001–003.
const BASELINE_MIGRATIONS = [
  "001_create_initial_schema",
  "002_create_users",
  "003_families",
];

/**
 * Locate the plain-SQL migrations directory in both layouts:
 *  - bundled runtime: copied next to dist/server.js (tsup onSuccess) → ./migrations
 *  - source/dev/tests: backend/migrations (this file is src/db/migrate.ts)
 */
function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundled = path.join(here, "migrations");
  if (existsSync(bundled)) return bundled;
  return path.join(here, "..", "..", "migrations");
}

export interface MigrateOptions {
  log?: (msg: string) => void;
}

/**
 * Apply all pending migrations. node-pg-migrate takes a Postgres advisory lock
 * by default, so concurrent boots (e.g. a brief rolling-update overlap) are safe.
 * Forward-only — no automated down migrations.
 *
 * Intentionally free of app config/logger imports so it can run inside the
 * Vitest global setup without a fully-configured environment.
 */
export async function runMigrations(databaseUrl: string, options: MigrateOptions = {}): Promise<void> {
  await adoptFlywaySchemaIfNeeded(databaseUrl, options.log ?? (() => {}));
  await migrationRunner({
    databaseUrl,
    dir: migrationsDir(),
    direction: "up",
    migrationsTable: MIGRATIONS_TABLE,
    count: Infinity,
    log: options.log ?? (() => {}),
  });
}

/**
 * One-time Flyway → node-pg-migrate handoff. If the migrations table is absent
 * but the schema already exists (the production DB was migrated by Flyway's
 * V1–V3, which 001–003 reproduce exactly), record the baseline as already-applied
 * so node-pg-migrate adopts the schema instead of recreating it. A fresh database
 * (no `recipes` table) is left untouched and migrates normally.
 */
async function adoptFlywaySchemaIfNeeded(
  databaseUrl: string,
  log: (msg: string) => void,
): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ tracking: string | null; schema: string | null }>(
      `SELECT to_regclass('public.${MIGRATIONS_TABLE}') AS tracking, to_regclass('public.recipes') AS schema`,
    );
    const hasTrackingTable = rows[0]?.tracking !== null;
    const hasExistingSchema = rows[0]?.schema !== null;
    if (hasTrackingTable || !hasExistingSchema) return;

    log("Adopting existing Flyway schema: baselining migrations 001–003 as applied.");
    await client.query(
      `CREATE TABLE "${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, name varchar(255) NOT NULL, run_on timestamp NOT NULL)`,
    );
    await client.query(
      `INSERT INTO "${MIGRATIONS_TABLE}" (name, run_on) SELECT unnest($1::text[]), now()`,
      [BASELINE_MIGRATIONS],
    );
  } finally {
    await client.end();
  }
}
