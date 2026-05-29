import { Router } from "express";
import type { Db } from "../db/kysely.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildAggregatedShoppingItems, type RecipeEntry } from "../service/shoppingListService.js";
import { MealPlanRepository } from "../storage/mealPlanRepository.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

/** Authenticated shopping-list route; mounted under /api (after requireAuth). */
export function shoppingListRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const mealPlans = new MealPlanRepository(db);
  const recipes = new RecipeRepository(db);
  const router = Router();

  router.get("/shopping-lists", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = typeof req.query.week === "string" ? req.query.week : currentWeekIdentifier();

    const plan = await mealPlans.findByWeek(familyId, weekId);
    if (!plan) {
      res.json({ weekIdentifier: weekId, items: [] });
      return;
    }

    const distinctIds = [...new Set(plan.assignments.map((a) => a.recipeId))];
    const found = await recipes.findByIds(familyId, distinctIds);
    const recipeById = new Map<string, RecipeEntry>(found.map((r) => [r.id, r]));
    const items = buildAggregatedShoppingItems(plan, recipeById);
    res.json({ weekIdentifier: weekId, items });
  });

  return router;
}
