import express, { type Express } from "express";
import cors from "cors";
import type { Db } from "./db/kysely.js";
import { httpLogger } from "./logger.js";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/error.js";

export interface AppDeps {
  db: Db;
}

/**
 * Assemble the Express application. Returns the app without listening so it can
 * be driven in-process by supertest. The `/api/*` routes are mounted in later
 * commits; the SPA static fallback is added in commit 11.
 */
export function buildApp(_deps: AppDeps): Express {
  const app = express();
  // Behind the K8s Ingress: trust X-Forwarded-* so req.ip / protocol are correct.
  app.set("trust proxy", true);
  app.use(httpLogger);
  app.use(express.json({ limit: "1mb" }));
  // Mirror the permissive Kotlin CORS config (anyHost + credentials).
  app.use(cors({ origin: true, credentials: true }));

  app.use(healthRouter);

  app.use(errorHandler);
  return app;
}
