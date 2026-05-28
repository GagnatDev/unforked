import { Router } from "express";
import { z } from "zod";
import { hashPassword, signToken, verifyPassword } from "../auth/auth.js";
import type { Db } from "../db/kysely.js";
import { emailField, passwordField } from "../domain/fields.js";
import { validateBody } from "../middleware/validate.js";
import { FamilyInviteService } from "../service/familyInviteService.js";
import { UserRepository, toUserInfo } from "../storage/userRepository.js";

// Login does not require a non-empty password — a blank one simply fails the
// bcrypt check and returns 401, matching the Kotlin behavior.
const loginSchema = z.object({ email: emailField, password: z.string() });
const setupSchema = z.object({ email: emailField, password: passwordField });
const registerInviteSchema = z.object({
  token: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Token required")),
  email: emailField,
  password: passwordField,
});

/** Public auth endpoints mounted at /api/auth. */
export function authPublicRouter(db: Db): Router {
  const users = new UserRepository(db);
  const router = Router();

  router.post("/login", validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = await signToken(user.id, user.role);
    res.json({ token, user: toUserInfo(user) });
  });

  // First-run bootstrap: creates the initial admin only while there are no users.
  router.post("/setup", validateBody(setupSchema), async (req, res) => {
    if ((await users.count()) > 0) {
      res.status(403).json({ error: "Setup already completed" });
      return;
    }
    const { email, password } = req.body as z.infer<typeof setupSchema>;
    const user = await users.createWithNewFamily(email, await hashPassword(password), "admin");
    const token = await signToken(user.id, "admin");
    res.json({ token, user: toUserInfo(user) });
  });

  // Register a new account by accepting a family invite.
  router.post("/register-invite", validateBody(registerInviteSchema), async (req, res) => {
    const { token, email, password } = req.body as z.infer<typeof registerInviteSchema>;
    const userId = await new FamilyInviteService(db).registerWithInvite(token, email, password);
    const user = await users.findById(userId);
    if (!user) {
      res.status(400).json({ error: "Registration failed" });
      return;
    }
    const jwt = await signToken(user.id, user.role);
    res.json({ token: jwt, user: toUserInfo(user) });
  });

  return router;
}
