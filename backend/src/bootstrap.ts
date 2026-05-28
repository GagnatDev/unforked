import type { Server } from "node:http";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import { createDb } from "./db/kysely.js";
import { createPool } from "./db/pool.js";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { seedTestRecipesIfEmpty } from "./seed/seedData.js";

export interface StartedServer {
  server: Server;
  pool: Pool;
}

/**
 * Wire pool → Kysely → Express and start listening. Shared by the production
 * entry (server.ts) and the e2e entry (e2e-server.ts). Migrations are run by
 * the caller before this (see commit 3 wiring in server.ts).
 */
export async function startServer(connectionString?: string): Promise<StartedServer> {
  const pool = createPool(connectionString);
  const db = createDb(pool);

  // Dev/e2e seeding (after migrations, which the caller runs first).
  if (env.SEED_TEST_DATA) {
    await seedTestRecipesIfEmpty(db);
  }

  const app = buildApp({ db });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "backend listening");
      resolve(s);
    });
  });

  registerShutdown(server, pool);
  return { server, pool };
}

/** Graceful shutdown: stop accepting connections, drain, then close the pool. */
function registerShutdown(server: Server, pool: Pool): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
