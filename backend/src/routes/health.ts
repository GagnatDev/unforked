import { Router } from "express";

// Liveness probe — intentionally does no DB work, matching the Kotlin endpoint
// and the K8s probe expectations. Migrations complete before the server starts
// listening, so the DB is already reachable by the time this can be hit.
export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
