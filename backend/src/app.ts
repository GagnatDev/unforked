import express, { Router, type Express } from "express";
import cors from "cors";
import type { Db } from "./db/kysely.js";
import { httpLogger } from "./logger.js";
import { errorHandler } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { authPublicRouter } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";

export interface AppDeps {
  db: Db;
}

/**
 * Assemble the Express application. Returns the app without listening so it can
 * be driven in-process by supertest. The SPA static fallback is added in
 * commit 11.
 */
export function buildApp(deps: AppDeps): Express {
  const app = express();
  // Behind the K8s Ingress: trust X-Forwarded-* so req.ip / protocol are correct.
  app.set("trust proxy", true);
  app.use(httpLogger);
  app.use(express.json({ limit: "1mb" }));
  // Mirror the permissive Kotlin CORS config (anyHost + credentials).
  app.use(cors({ origin: true, credentials: true }));

  app.use(healthRouter);

  // Public auth endpoints.
  app.use("/api/auth", authPublicRouter(deps.db));

  // Authenticated API.
  const api = Router();
  api.use(requireAuth());
  api.use(userRoutes(deps.db));
  app.use("/api", api);

  app.use(errorHandler);
  return app;
}
