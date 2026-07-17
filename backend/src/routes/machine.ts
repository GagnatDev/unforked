import { Router, type Response } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import { SHOPPING_CATEGORIES } from "../domain/ingredientCategories.js";
import { resolveWeekAlias } from "../domain/weekIdentifier.js";
import { currentApiKey, requireScope } from "../middleware/machineAuth.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import { getSyncedShoppingList } from "../service/shoppingListRead.js";
import { addManualItems } from "../service/shoppingListWrite.js";
import { MealPlanRepository } from "../storage/mealPlanRepository.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const addItemsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, "item name is required"),
        quantity: z.string().default(""),
        unit: z.string().default(""),
        category: z.enum(SHOPPING_CATEGORIES).optional(),
      }),
    )
    .min(1, "at least one item is required")
    .max(50, "at most 50 items per request"),
});

/**
 * The machine API surface (docs/aivo-integration.md §5): endpoints versioned
 * under /machine/v1, served exclusively on the machine listener after
 * requireApiKey. All data is scoped to the key owner's family; the week path
 * segment accepts `current`/`next` aliases so callers never re-implement
 * ISO-week arithmetic. Reads need any valid key; the one mutating endpoint
 * (adding shopping-list items, §8 Phase 3) additionally requires the `write`
 * scope.
 */
export function machineRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const mealPlans = new MealPlanRepository(db);
  const recipes = new RecipeRepository(db);
  const router = Router();

  function resolveWeekOr400(raw: string, res: Response): string | null {
    const weekId = resolveWeekAlias(raw);
    if (!weekId) {
      res.status(400).json({ error: "Invalid week: use YYYY-Wnn, 'current' or 'next'" });
    }
    return weekId;
  }

  // Meal plan with recipe details resolved inline (id, name, tags) so a caller
  // can answer "what's for dinner?" in one round trip. A deleted recipe falls
  // back to the name stored on the assignment.
  router.get("/meal-plans/:week", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeekOr400(req.params.week, res);
    if (!weekId) return;

    const plan = await mealPlans.findByWeek(familyId, weekId);
    const assignments = plan?.doc.assignments ?? [];
    const distinctIds = [...new Set(assignments.map((a) => a.recipeId))];
    const found = await recipes.findByIds(familyId, distinctIds);
    const byId = new Map(found.map((r) => [r.id, r.doc]));

    res.json({
      weekIdentifier: weekId,
      defaultPersons: plan?.doc.defaultPersons ?? null,
      assignments: assignments.map((a) => ({
        day: a.day,
        persons: a.persons ?? null,
        recipe: {
          id: a.recipeId,
          name: byId.get(a.recipeId)?.name ?? a.recipeName,
          tags: byId.get(a.recipeId)?.tags ?? [],
        },
      })),
    });
  });

  // The same sync-on-read path the human GET uses, so the caller sees what the
  // family sees in the UI — checked state, category choices, manual items. The
  // sync write is idempotent and never destroys user state.
  router.get("/shopping-lists/:week", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeekOr400(req.params.week, res);
    if (!weekId) return;
    const { doc } = await getSyncedShoppingList(db, familyId, weekId);
    res.json(doc);
  });

  // Batch-add manual items to a week's list — the first write-scoped endpoint
  // (Phase 3). Reuses the human POST's service path: items are auto-categorized
  // from the family's overrides, and a missing week row is created on the fly.
  // Aivo sends what the owner asked for in chat ("add milk and batteries").
  router.post(
    "/shopping-lists/:week/items",
    requireScope("write"),
    validateBody(addItemsSchema),
    async (req, res) => {
      const { familyId } = await requireUserAndFamily(users, req);
      // With middleware in front Express widens params to string | string[];
      // a repeated segment stringifies to "a,b" and fails week validation.
      const weekId = resolveWeekOr400(String(req.params.week), res);
      if (!weekId) return;
      const { items } = req.body as z.infer<typeof addItemsSchema>;
      // Machine adds are a first-class change source: addManualItems emits the
      // same shopping-list.changed event as human adds, attributed to the key.
      const key = currentApiKey(req);
      const created = await addManualItems(db, familyId, weekId, items, {
        kind: "machine",
        id: key.id,
        label: key.name,
      });
      res.status(201).json({ weekIdentifier: weekId, items: created });
    },
  );

  // Compact recipe corpus (docs/aivo-integration.md §5.3 Option B): a
  // token-efficient shape for LLM-side ingredient matching. Ingredient names
  // only — quantities and steps live on the by-id endpoint.
  router.get("/recipes/compact", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const all = await recipes.findAll(familyId);
    res.json(
      all.map((r) => ({
        id: r.id,
        name: r.doc.name,
        tags: r.doc.tags,
        ingredients: r.doc.ingredients.map((i) => i.name),
      })),
    );
  });

  // Full recipe (ingredients + steps) for "how do I make it?" follow-ups.
  // Same wire shape as the human API's GET /api/recipes/:id.
  router.get("/recipes/:id", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const found = await recipes.findById(familyId, id);
    if (!found) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json({ id, doc: found.doc });
  });

  // Credential self-check: echoes the key's owner and metadata so a caller can
  // health-check its configuration at startup.
  router.get("/me", async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const key = currentApiKey(req);
    res.json({
      email: user.email,
      familyId,
      key: {
        id: key.id,
        name: key.name,
        scopes: key.scopes,
        createdAt: key.created_at.toISOString(),
        expiresAt: key.expires_at?.toISOString() ?? null,
      },
    });
  });

  return router;
}
