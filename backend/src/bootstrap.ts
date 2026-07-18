import type { Server } from "node:http";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import { buildMachineApp } from "./machineApp.js";
import { createDb } from "./db/kysely.js";
import { createPool } from "./db/pool.js";
import { env, homectlImportConfig, vapidConfig } from "./config/env.js";
import { logger } from "./logger.js";
import { seedDevPrincipal } from "./seed/devPrincipal.js";
import { seedTestRecipesIfEmpty } from "./seed/seedData.js";
import { importUsersToHomectlOnce } from "./service/homectlUserImport.js";
import { startNotificationPolicy } from "./service/notificationPolicy.js";
import { createPushSender } from "./service/pushSender.js";

export interface StartedServer {
  server: Server;
  /** The machine API listener (API-key auth only; in-cluster clients). */
  machineServer: Server;
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

  // One-time seeding of existing accounts into homectl-auth, before serving
  // traffic on the first deploy with the auth sidecar. A failure aborts boot
  // (fail fast) so the import is retried on the next start. The app does not
  // call listen() until this returns, and the auth-proxy sidecar's k8s probes
  // wait on http://127.0.0.1:8080/health so ingress traffic cannot arrive mid-import.
  const importConfig = homectlImportConfig(env);
  if (importConfig) {
    await importUsersToHomectlOnce(db, importConfig, (msg) => logger.info(msg));
  }

  // Dev/e2e seeding (after migrations, which the caller runs first). The dev
  // principal must exist for the DISABLE_AUTH header-less fallback to resolve.
  if (env.DISABLE_AUTH) {
    await seedDevPrincipal(db);
  }
  if (env.SEED_TEST_DATA) {
    await seedTestRecipesIfEmpty(db);
  }

  // Notification policy engine (design #104 D6): one per process, fed by the
  // in-process change-event bus, so it sees the human and machine listeners'
  // writes alike. Without VAPID keys push is disabled and the engine is moot.
  const vapid = vapidConfig(env);
  if (vapid) {
    startNotificationPolicy({ db, sender: createPushSender(db, vapid) });
    logger.info("shopping-list notification policy engine started");
  } else {
    logger.info("VAPID keys not configured; push notification policy disabled");
  }

  const app = buildApp({ db });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "backend listening");
      resolve(s);
    });
  });

  // The machine API (docs/aivo-integration.md): same process and Db, separate
  // Express app on a separate port. Shares this process's lifecycle; /health
  // and the k8s probes stay on the human listener.
  const machineApp = buildMachineApp({ db });
  const machineServer = await new Promise<Server>((resolve) => {
    const s = machineApp.listen(env.MACHINE_PORT, () => {
      logger.info({ port: env.MACHINE_PORT }, "machine API listening");
      resolve(s);
    });
  });

  registerShutdown([server, machineServer], pool);
  return { server, machineServer, pool };
}

/** Graceful shutdown: stop accepting connections, drain, then close the pool. */
function registerShutdown(servers: Server[], pool: Pool): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    let remaining = servers.length;
    for (const server of servers) {
      server.close(() => {
        remaining -= 1;
        if (remaining === 0) {
          void pool.end().finally(() => process.exit(0));
        }
      });
    }
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
