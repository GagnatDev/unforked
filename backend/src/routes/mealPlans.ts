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
    const doc = await mealPlans.findByWeek(familyId, weekId);
    res.json(doc ?? { weekIdentifier: weekId, assignments: [] });
  });

  router.put("/meal-plans/current", validateBody(mealPlanDocSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const body = req.body as z.infer<typeof mealPlanDocSchema>;
    if (body.weekIdentifier !== weekId) {
      res.status(400).json({ error: "weekIdentifier must match query week or current" });
      return;
    }
    await mealPlans.upsert(familyId, body);
    res.json(body);
  });

  return router;
}
