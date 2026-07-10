import { Router } from "express";
import type { Db } from "../db/kysely.js";
import { currentUser } from "../middleware/auth.js";
import { UserRepository, toUserInfo } from "../storage/userRepository.js";

/**
 * Authenticated user routes; mounted under /api (after requireAuth).
 *
 * Account management (create user, passwords, roles) lives in homectl-auth;
 * this app only exposes the resolved identity.
 */
export function userRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const router = Router();

  router.get("/auth/me", async (req, res) => {
    const { userId, role } = currentUser(req);
    const user = await users.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // The role asserted by homectl-auth (via the sidecar header) wins over the
    // stored one, which is only a snapshot from provisioning/import time.
    res.json({ ...toUserInfo(user), role });
  });

  return router;
}
