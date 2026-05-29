// Entry point for the Playwright e2e backend: a fully self-contained server
// backed by a Testcontainers Postgres, with auth disabled and a seeded dev
// principal. Mirrors the Kotlin E2eBackendMain.
//
// Env vars (config/env.ts) are read at import time, so DATABASE_URL/PORT/etc.
// must be set before the app modules are imported — hence the dynamic imports
// after the container starts.
import { PostgreSqlContainer } from "@testcontainers/postgresql";

process.env.PORT = process.env.E2E_BACKEND_PORT ?? "18080";
process.env.DISABLE_AUTH = "true";

const container = await new PostgreSqlContainer("postgres:16-alpine").start();
process.env.DATABASE_URL = container.getConnectionUri();

const { runMigrations } = await import("./db/migrate.js");
await runMigrations(process.env.DATABASE_URL);

const { createPool } = await import("./db/pool.js");
const { createDb } = await import("./db/kysely.js");
const { seedDevPrincipal } = await import("./seed/devPrincipal.js");

const seedPool = createPool();
await seedDevPrincipal(createDb(seedPool));
await seedPool.end();

const { startServer } = await import("./bootstrap.js");
await startServer();

// Testcontainers' reaper removes the container when the process exits; this is a
// best-effort explicit stop on top of that.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void container.stop();
  });
}
