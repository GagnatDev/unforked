import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import {
  SHOPPING_CATEGORIES,
  normalizeIngredientName,
} from "../domain/ingredientCategories.js";
import type { PersistedShoppingListDoc } from "../domain/types.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildAggregatedShoppingItems, type RecipeEntry } from "../service/shoppingListService.js";
import { createManualEntry, syncShoppingListDoc } from "../service/shoppingListSync.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import { IngredientCategoryRepository } from "../storage/ingredientCategoryRepository.js";
import { MealPlanRepository } from "../storage/mealPlanRepository.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { ShoppingListRepository } from "../storage/shoppingListRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const categorySchema = z.enum(SHOPPING_CATEGORIES);

const patchItemSchema = z
  .object({
    checked: z.boolean().optional(),
    category: categorySchema.optional(),
  })
  .refine((body) => body.checked !== undefined || body.category !== undefined, {
    message: "at least one of checked or category is required",
  });

const addItemSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  quantity: z.string().default(""),
  unit: z.string().default(""),
  category: categorySchema.optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/** Authenticated shopping-list routes; mounted under /api (after requireAuth). */
export function shoppingListRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const mealPlans = new MealPlanRepository(db);
  const recipes = new RecipeRepository(db);
  const shoppingLists = new ShoppingListRepository(db);
  const ingredientCategories = new IngredientCategoryRepository(db);
  const router = Router();

  function resolveWeek(weekParam: unknown): string {
    return typeof weekParam === "string" ? weekParam : currentWeekIdentifier();
  }

  /**
   * Sync the persisted list with the current meal plan and write it back, so
   * every GET self-heals after plan edits while keeping check-offs, category
   * choices and manual items. The row lock serializes against item mutations.
   */
  async function loadSyncedList(
    familyId: string,
    weekId: string,
  ): Promise<PersistedShoppingListDoc> {
    const plan = await mealPlans.findByWeek(familyId, weekId);
    let aggregate: ReturnType<typeof buildAggregatedShoppingItems> = [];
    if (plan) {
      const distinctIds = [...new Set(plan.assignments.map((a) => a.recipeId))];
      const found = await recipes.findByIds(familyId, distinctIds);
      const recipeById = new Map<string, RecipeEntry>(found.map((r) => [r.id, r]));
      aggregate = buildAggregatedShoppingItems(plan, recipeById);
    }
    const overrides = await ingredientCategories.findAllForFamily(familyId);

    return db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const merged = syncShoppingListDoc(row?.doc, aggregate, overrides, weekId);
      if (row) {
        await shoppingLists.updateDoc(trx, row.id, merged);
      } else if (merged.items.length > 0) {
        // Don't create rows for casually browsed empty weeks.
        await shoppingLists.insert(trx, familyId, merged);
      }
      return merged;
    });
  }

  router.get("/shopping-lists", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    try {
      res.json(await loadSyncedList(familyId, weekId));
    } catch (err) {
      // Two first-GETs for the same week can race on the insert; the loser
      // retries and takes the update path.
      if (!isUniqueViolation(err)) throw err;
      res.json(await loadSyncedList(familyId, weekId));
    }
  });

  router.patch("/shopping-lists/items/:id", validateBody(patchItemSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const itemId = requireUuidParam(req.params.id, res);
    if (!itemId) return;
    const body = req.body as z.infer<typeof patchItemSchema>;

    const updated = await db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const item = row?.doc.items.find((i) => i.id === itemId);
      if (!row || !item) return null;
      if (body.checked !== undefined) item.checked = body.checked;
      if (body.category !== undefined) {
        item.category = body.category;
        // Remember the family's choice for future lists, every week.
        await ingredientCategories.upsert(
          familyId,
          normalizeIngredientName(item.name),
          body.category,
          trx,
        );
      }
      await shoppingLists.updateDoc(trx, row.id, row.doc);
      return item;
    });

    if (!updated) {
      res.status(404).json({ error: "Shopping-list item not found" });
      return;
    }
    res.json(updated);
  });

  router.post("/shopping-lists/items", validateBody(addItemSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const body = req.body as z.infer<typeof addItemSchema>;
    const overrides = await ingredientCategories.findAllForFamily(familyId);

    const insertManualItem = () =>
      db.transaction().execute(async (trx) => {
        const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
        const entry = createManualEntry(body, overrides);
        if (row) {
          row.doc.items.push(entry);
          await shoppingLists.updateDoc(trx, row.id, row.doc);
        } else {
          // First item of a week without a plan: create the list on the fly.
          await shoppingLists.insert(trx, familyId, { weekIdentifier: weekId, items: [entry] });
        }
        return entry;
      });

    let created;
    try {
      created = await insertManualItem();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      created = await insertManualItem();
    }
    res.status(201).json(created);
  });

  router.delete("/shopping-lists/items/:id", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const itemId = requireUuidParam(req.params.id, res);
    if (!itemId) return;

    const outcome = await db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const item = row?.doc.items.find((i) => i.id === itemId);
      if (!row || !item) return "notFound" as const;
      // Recipe-derived items would just reappear on the next sync.
      if (!item.manual) return "notManual" as const;
      row.doc.items = row.doc.items.filter((i) => i.id !== itemId);
      await shoppingLists.updateDoc(trx, row.id, row.doc);
      return "deleted" as const;
    });

    if (outcome === "notFound") {
      res.status(404).json({ error: "Shopping-list item not found" });
      return;
    }
    if (outcome === "notManual") {
      res.status(400).json({ error: "Only manually added items can be deleted" });
      return;
    }
    res.status(204).end();
  });

  return router;
}
