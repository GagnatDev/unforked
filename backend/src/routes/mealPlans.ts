import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { validateBody } from "../middleware/validate.js";
import { MealPlanRepository } from "../storage/mealPlanRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const dayAssignmentSchema = z.object({
  day: z.string(),
  recipeId: z.string(),
  recipeName: z.string(),
  persons: z.number().int().nullish(),
});

const mealPlanDocSchema = z.object({
  weekIdentifier: z.string(),
  defaultPersons: z.number().int().nullish(),
  assignments: z.array(dayAssignmentSchema).default([]),
});

// PUT accepts an optional `baseVersion` for optimistic concurrency
// (offline-first A5); a stale version is rejected with 409 + the current plan.
const mealPlanPutSchema = mealPlanDocSchema.extend({
  baseVersion: z.number().int().nonnegative().optional(),
});

function resolveWeek(weekParam: unknown): string {
  return typeof weekParam === "string" ? weekParam : currentWeekIdentifier();
}

/** Authenticated meal-plan routes; mounted under /api (after requireAuth). */
export function mealPlanRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const mealPlans = new MealPlanRepository(db);
  const router = Router();

  router.get("/meal-plans/current", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const found = await mealPlans.findByWeek(familyId, weekId);
    if (!found) {
      res.json({ weekIdentifier: weekId, assignments: [], version: 0 });
      return;
    }
    res.json({ ...found.doc, version: found.version });
  });

  router.put("/meal-plans/current", validateBody(mealPlanPutSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const { baseVersion, ...doc } = req.body as z.infer<typeof mealPlanPutSchema>;
    if (doc.weekIdentifier !== weekId) {
      res.status(400).json({ error: "weekIdentifier must match query week or current" });
      return;
    }
    const outcome = await mealPlans.upsert(familyId, doc, baseVersion);
    if (outcome.status === "conflict") {
      res.status(409).json({ error: "conflict", ...outcome.doc, version: outcome.version });
      return;
    }
    res.json({ ...doc, version: outcome.version });
  });

  return router;
}
