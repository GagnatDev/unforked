import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import { isValidUuid } from "../domain/fields.js";
import { importFromUrl } from "../importer/recipeImporter.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import type { PhotoStorage } from "../service/photoStorage.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";
import { photoKeys } from "./recipePhotos.js";

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

// Create accepts an optional client-minted UUID (offline-first: the client
// mints the id so a create need not wait for a server round-trip). The doc
// itself is unchanged; `id` is stripped off before it is persisted.
const recipeCreateSchema = recipeDocSchema.extend({
  id: z.string().uuid().optional(),
});

// Update accepts an optional `baseVersion` for optimistic concurrency
// (offline-first A5). When present, a stale version is rejected with 409 and
// the current server doc; when absent the update is unconditional (legacy).
const recipeUpdateSchema = recipeDocSchema.extend({
  baseVersion: z.number().int().nonnegative().optional(),
});

const importSchema = z.object({ url: z.string() });

/**
 * Authenticated recipe routes; mounted under /api (after requireAuth).
 * `photoStorage` (optional) lets recipe deletion clean up the recipe's photo
 * objects in the bucket; photo management itself lives in recipePhotos.ts.
 */
export function recipeRoutes(db: Db, photoStorage?: PhotoStorage | null): Router {
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
    const found = await recipes.findById(familyId, id);
    if (!found) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json({ id, doc: found.doc, version: found.version });
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

  router.post("/recipes", validateBody(recipeCreateSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const { id: clientId, ...doc } = req.body as z.infer<typeof recipeCreateSchema>;
    const created = await recipes.insert(familyId, doc, clientId);
    res.status(201).json({ id: created.id, doc, version: created.version });
  });

  router.put("/recipes/:id", validateBody(recipeUpdateSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const { baseVersion, ...doc } = req.body as z.infer<typeof recipeUpdateSchema>;
    const outcome = await recipes.update(familyId, id, doc, baseVersion);
    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    if (outcome.status === "conflict") {
      // Stale write: hand back the current server doc so the sync engine can
      // field-merge and retry (offline-first A5) instead of clobbering.
      res.status(409).json({ error: "conflict", id, doc: outcome.doc, version: outcome.version });
      return;
    }
    // Echo the doc as persisted: the store re-attaches the recipe's photo,
    // which clients cannot set through this route.
    res.json({ id, doc: outcome.doc ?? doc, version: outcome.version });
  });

  router.delete("/recipes/:id", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const existing = await recipes.findById(familyId, id);
    if (!existing || !(await recipes.delete(familyId, id))) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    // Best-effort: an orphaned object only wastes bucket space.
    const keys = photoKeys(existing.doc.photo);
    if (photoStorage && keys.length > 0) await photoStorage.deleteAll(keys);
    res.status(204).end();
  });

  return router;
}
