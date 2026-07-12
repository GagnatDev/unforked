import express, { Router, type Express } from "express";
import type { Db } from "./db/kysely.js";
import { httpLogger } from "./logger.js";
import { errorHandler } from "./middleware/error.js";
import { requireApiKey } from "./middleware/machineAuth.js";
import { machineRoutes } from "./routes/machine.js";

export interface MachineAppDeps {
  db: Db;
}

/**
 * Assemble the machine API application (docs/aivo-integration.md §2): a sibling
 * Express app served on its own listener port, for in-cluster machine clients
 * (Aivo). It mounts only the /machine/v1 routes, authenticates exclusively by
 * API key, and — unlike the human app — never consults the X-Homectl-* identity
 * headers, so it must never be reachable through the auth-proxy sidecar or any
 * Ingress. Isolation is enforced at the network layer (dedicated Service +
 * NetworkPolicy, see k8s/deployment.yml).
 *
 * Returns the app without listening so it can be driven in-process by supertest.
 */
export function buildMachineApp(deps: MachineAppDeps): Express {
  const app = express();
  app.set("trust proxy", true);
  app.use(httpLogger);
  // No JSON body parsing: the v1 surface is read-only (GET only). A future
  // `write` scope adds the parser alongside its endpoints.

  const v1 = Router();
  v1.use(requireApiKey(deps.db));
  v1.use(machineRoutes(deps.db));
  app.use("/machine/v1", v1);

  // Anything else on this listener is a 404 — including the human API routes
  // and the SPA, which exist only on the human listener (S2).
  app.use(errorHandler);
  return app;
}
