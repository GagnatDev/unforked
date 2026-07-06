import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import { isValidUuid } from "../domain/fields.js";
import { importFromUrl } from "../importer/recipeImporter.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  unit: z.string().default(""),
});

// Mirrors the Kotlin RecipeDoc defaults: name required, everything else defaulted.
const recipeDocSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().default(""),
  sourceUrl: z.string().nullish(),
  sourceName: z.string().nullish(),
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(z.string()).default([]),
  servings: z.number().int().default(4),
  tags: z.array(z.string()).default([]),
});

const importSchema = z.object({ url: z.string() });

/** Authenticated recipe routes; mounted under /api (after requireAuth). */
export function recipeRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const recipes = new RecipeRepository(db);
  const router = Router();

  router.get("/recipes", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const name = typeof req.query.name === "string" ? req.query.name : undefined;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    res.json(await recipes.findAll(familyId, { nameQuery: name, tagQuery: tag }));
  });

  router.get("/recipes/tags", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      res.json([]);
      return;
    }
    const rawExclude = req.query.excludeRecipeId;
    const excludeRecipeId =
      typeof rawExclude === "string" && isValidUuid(rawExclude) ? rawExclude : undefined;
    res.json(await recipes.suggestTags(familyId, q, excludeRecipeId));
  });

  router.get("/recipes/:id", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const doc = await recipes.findById(familyId, id);
    if (!doc) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json({ id, doc });
  });

  router.post("/recipes/import", validateBody(importSchema), async (req, res) => {
    await requireUserAndFamily(users, req);
    const { url } = req.body as z.infer<typeof importSchema>;
    try {
      res.json(await importFromUrl(url));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Import failed" });
    }
  });

  router.post("/recipes", validateBody(recipeDocSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const doc = req.body as z.infer<typeof recipeDocSchema>;
    const id = await recipes.insert(familyId, doc);
    res.status(201).json({ id, doc });
  });

  router.put("/recipes/:id", validateBody(recipeDocSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const doc = req.body as z.infer<typeof recipeDocSchema>;
    if (!(await recipes.update(familyId, id, doc))) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json({ id, doc });
  });

  router.delete("/recipes/:id", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    if (!(await recipes.delete(familyId, id))) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}
