import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import {
  SHOPPING_CATEGORIES,
  normalizeIngredientName,
} from "../domain/ingredientCategories.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { getSyncedShoppingList } from "../service/shoppingListRead.js";
import { addManualItems } from "../service/shoppingListWrite.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import { IngredientCategoryRepository } from "../storage/ingredientCategoryRepository.js";
import { ShoppingListRepository } from "../storage/shoppingListRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const categorySchema = z.enum(SHOPPING_CATEGORIES);

const patchItemSchema = z
  .object({
    checked: z.boolean().optional(),
    category: categorySchema.optional(),
    name: z.string().trim().min(1, "name must not be empty").optional(),
    quantity: z.string().optional(),
    unit: z.string().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "at least one field is required",
  });

const addItemSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  quantity: z.string().default(""),
  unit: z.string().default(""),
  category: categorySchema.optional(),
});

/** Authenticated shopping-list routes; mounted under /api (after requireAuth). */
export function shoppingListRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const shoppingLists = new ShoppingListRepository(db);
  const ingredientCategories = new IngredientCategoryRepository(db);
  const router = Router();

  function resolveWeek(weekParam: unknown): string {
    return typeof weekParam === "string" ? weekParam : currentWeekIdentifier();
  }

  // Sync-on-read (self-heal after plan edits while keeping check-offs, category
  // choices and manual items) lives in service/shoppingListRead.ts, shared with
  // the machine API so Aivo sees exactly what the family sees here.
  router.get("/shopping-lists", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    res.json(await getSyncedShoppingList(db, familyId, weekId));
  });

  router.patch("/shopping-lists/items/:id", validateBody(patchItemSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const itemId = requireUuidParam(req.params.id, res);
    if (!itemId) return;
    const body = req.body as z.infer<typeof patchItemSchema>;
    // name/quantity/unit describe the item itself; recipe-derived items rebuild
    // those from the plan on the next sync, so only manual entries may edit them.
    const editsContent =
      body.name !== undefined || body.quantity !== undefined || body.unit !== undefined;

    const outcome = await db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const item = row?.doc.items.find((i) => i.id === itemId);
      if (!row || !item) return { status: "notFound" as const };
      if (editsContent && !item.manual) return { status: "notManual" as const };
      // Apply name/quantity/unit before category so the remembered override
      // below is keyed to the item's new name.
      if (body.name !== undefined) item.name = body.name;
      if (body.quantity !== undefined) item.quantity = body.quantity;
      if (body.unit !== undefined) item.unit = body.unit;
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
      return { status: "ok" as const, item };
    });

    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Shopping-list item not found" });
      return;
    }
    if (outcome.status === "notManual") {
      res.status(400).json({ error: "Only manually added items can be edited" });
      return;
    }
    res.json(outcome.item);
  });

  router.post("/shopping-lists/items", validateBody(addItemSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const body = req.body as z.infer<typeof addItemSchema>;
    const [created] = await addManualItems(db, familyId, weekId, [body]);
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
