import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import { emailField, tokenField } from "../domain/fields.js";
import { validateBody } from "../middleware/validate.js";
import { FamilyInviteService } from "../service/familyInviteService.js";
import { FamilyInvitationRepository } from "../storage/familyInvitationRepository.js";
import { FamilyRepository } from "../storage/familyRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const patchFamilySchema = z.object({
  defaultMealPlanPersons: z
    .number()
    .int()
    .min(1, "defaultMealPlanPersons must be between 1 and 50")
    .max(50, "defaultMealPlanPersons must be between 1 and 50"),
});

const createInviteSchema = z.object({ email: emailField });

const acceptInviteSchema = z.object({
  token: tokenField,
});

/** Authenticated family routes; mounted under /api (after requireAuth). */
export function familyRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const families = new FamilyRepository(db);
  const invites = new FamilyInvitationRepository(db);
  const inviteService = new FamilyInviteService(db);
  const router = Router();

  router.get("/family", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const family = await families.findById(familyId);
    if (!family) {
      res.status(404).json({ error: "Family not found" });
      return;
    }
    const [memberRows, inviteRows] = await Promise.all([
      users.listByFamily(familyId),
      invites.listPendingForFamily(familyId),
    ]);
    const members = memberRows.map((u) => ({ id: u.id, email: u.email }));
    const pendingInvites = inviteRows.map((i) => ({
      id: i.id,
      inviteeEmail: i.invitee_email,
      token: i.token,
      expiresAt: i.expires_at.toISOString(),
    }));
    res.json({
      id: family.id,
      defaultMealPlanPersons: family.default_meal_plan_persons,
      members,
      pendingInvites,
    });
  });

  router.patch("/family", validateBody(patchFamilySchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const { defaultMealPlanPersons } = req.body as z.infer<typeof patchFamilySchema>;
    if (!(await families.updateDefaultMealPlanPersons(familyId, defaultMealPlanPersons))) {
      res.status(404).json({ error: "Family not found" });
      return;
    }
    res.json({ defaultMealPlanPersons });
  });

  router.post("/family/invites", validateBody(createInviteSchema), async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const { email } = req.body as z.infer<typeof createInviteSchema>;
    const { token, expiresAt } = await inviteService.createPendingInvite(familyId, user.id, email);
    res.json({ token, expiresAt: expiresAt.toISOString() });
  });

  router.post("/family/invites/accept", validateBody(acceptInviteSchema), async (req, res) => {
    const { user } = await requireUserAndFamily(users, req);
    const { token } = req.body as z.infer<typeof acceptInviteSchema>;
    await inviteService.acceptInviteForExistingUser(user, token);
    const updated = await users.findById(user.id);
    res.json({ familyId: updated?.family_id });
  });

  return router;
}
