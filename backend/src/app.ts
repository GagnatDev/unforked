import { existsSync } from "node:fs";
import path from "node:path";
import express, { Router, type Express, type Response } from "express";
import cors from "cors";
import { env, vapidConfig } from "./config/env.js";
import type { Db } from "./db/kysely.js";
import { httpLogger } from "./logger.js";
import { errorHandler } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";
import { apiKeyRoutes } from "./routes/apiKeys.js";
import { eventRoutes, type EventStreamOptions } from "./routes/events.js";
import { pushRoutes, type PushRouteOptions } from "./routes/push.js";
import { healthRouter } from "./routes/health.js";
import { userRoutes } from "./routes/users.js";
import { familyRoutes } from "./routes/family.js";
import { recipeRoutes } from "./routes/recipes.js";
import { mealPlanRoutes } from "./routes/mealPlans.js";
import { shoppingListRoutes } from "./routes/shoppingLists.js";

export interface AppDeps {
  db: Db;
  /** Directory of the built SPA to serve. Defaults to `<cwd>/web`; skipped if absent. */
  webRoot?: string;
  /** SSE stream tuning (heartbeat interval, per-user cap). Tests shrink these. */
  events?: EventStreamOptions;
  /** Web Push wiring (VAPID keys, delivery transport). Defaults to env config. */
  push?: PushRouteOptions;
}

function setStaticCacheHeaders(res: Response, filePath: string): void {
  if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
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

  // Authenticated API. Identity comes from the auth-proxy sidecar's headers;
  // there are no public auth endpoints (login/logout are owned by the sidecar).
  const api = Router();
  api.use(requireAuth(deps.db));
  api.use(userRoutes(deps.db));
  api.use(apiKeyRoutes(deps.db));
  api.use(familyRoutes(deps.db));
  api.use(recipeRoutes(deps.db));
  api.use(mealPlanRoutes(deps.db));
  api.use(shoppingListRoutes(deps.db));
  api.use(eventRoutes(deps.db, deps.events));
  api.use(pushRoutes(deps.db, deps.push ?? { vapid: vapidConfig(env) }));
  app.use("/api", api);

  // Serve the built SPA (single-container topology). express.static handles real
  // files; the terminal handler serves index.html for client-side routes. Skipped
  // when the directory is absent (e.g. local dev / tests), matching Ktor.
  const webRoot = deps.webRoot ?? path.resolve(process.cwd(), "web");
  if (existsSync(webRoot)) {
    const indexHtml = path.join(webRoot, "index.html");
    app.use(express.static(webRoot, { setHeaders: setStaticCacheHeaders }));
    // Express 5: no bare "*" route — use a named splat and skip API paths.
    app.get("/*splat", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
