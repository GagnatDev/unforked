import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../auth/auth.js";
import type { Db } from "../db/kysely.js";
import { emailField, passwordField } from "../domain/fields.js";
import { currentUser, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { UserRepository, toUserInfo } from "../storage/userRepository.js";

const createUserSchema = z.object({
  email: emailField,
  password: passwordField,
  role: z.string().optional(),
});

function normalizeRole(role: string | undefined): string {
  const r = (role ?? "user").toLowerCase();
  return r === "admin" || r === "user" ? r : "user";
}

/** Authenticated user routes; mounted under /api (after requireAuth). */
export function userRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const router = Router();

  router.get("/auth/me", async (req, res) => {
    const { userId } = currentUser(req);
    const user = await users.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(toUserInfo(user));
  });

  router.post("/users", requireAdmin(), validateBody(createUserSchema), async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;
    if (await users.findByEmail(body.email)) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const user = await users.createWithNewFamily(
      body.email,
      await hashPassword(body.password),
      normalizeRole(body.role),
    );
    res.status(201).json(toUserInfo(user));
  });

  return router;
}
