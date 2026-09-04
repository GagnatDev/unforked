import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import {
  SHOPPING_CATEGORIES,
  normalizeIngredientName,
} from "../domain/ingredientCategories.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { publishShoppingListEvent, type ChangeActor } from "../service/changeEvents.js";
import { getSyncedShoppingList } from "../service/shoppingListRead.js";
import { clearStatusFields } from "../service/shoppingListSync.js";
import { completeShoppingTrip, undoShoppingTrip } from "../service/shoppingListTrips.js";
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
    // Optimistic-concurrency precondition (offline-first A5). Excluded from the
    // "at least one field" check below so it never counts as an edit on its own.
    baseVersion: z.number().int().nonnegative().optional(),
  })
  .refine(
    ({ baseVersion: _baseVersion, ...edits }) =>
      Object.values(edits).some((value) => value !== undefined),
    { message: "at least one field is required" },
  );

const statusSchema = z.object({
  status: z.enum(["approved", "ready", "open"]),
  // Same optimistic-concurrency contract as item writes (design #104 D4).
  baseVersion: z.number().int().nonnegative().optional(),
});

const completeTripSchema = z.object({
  // Client-minted trip id + completion time (offline-first "Shopping done").
  id: z.string().uuid().optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  baseVersion: z.number().int().nonnegative().optional(),
});

const addItemSchema = z.object({
  // Optional client-minted UUID (offline-first: the client mints the item id so
  // an add need not wait for a server round-trip). Replaying the same create is
  // idempotent on this id. Malformed ids are rejected.
  id: z.string().uuid().optional(),
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

  function userActor(user: { id: string; email: string }): ChangeActor {
    return { kind: "user", id: user.id, label: user.email };
  }

  // Sync-on-read (self-heal after plan edits while keeping check-offs, category
  // choices and manual items) lives in service/shoppingListRead.ts, shared with
  // the machine API so Aivo sees exactly what the family sees here.
  router.get("/shopping-lists", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const { doc, version } = await getSyncedShoppingList(db, familyId, weekId);
    res.json({ ...doc, version });
  });

  router.patch("/shopping-lists/items/:id", validateBody(patchItemSchema), async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const itemId = requireUuidParam(req.params.id, res);
    if (!itemId) return;
    const { baseVersion, ...body } = req.body as z.infer<typeof patchItemSchema>;
    // name/quantity/unit describe the item itself; recipe-derived items rebuild
    // those from the plan on the next sync, so only manual entries may edit them.
    const editsContent =
      body.name !== undefined || body.quantity !== undefined || body.unit !== undefined;

    const outcome = await db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const item = row?.doc.items.find((i) => i.id === itemId);
      if (!row || !item) return { status: "notFound" as const };
      // Optimistic concurrency: a stale baseVersion loses to whatever the row
      // is now. The sync engine re-applies its single-field patch and retries.
      if (baseVersion !== undefined && row.version !== baseVersion) {
        return { status: "conflict" as const, doc: row.doc, version: row.version };
      }
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
      // A genuine edit bumps the version so concurrent stale writers 409.
      await shoppingLists.updateDoc(trx, row.id, row.doc, { bumpVersion: true });
      return {
        status: "ok" as const,
        item,
        version: row.version + 1,
        // Trip state at commit time, for the notification policy (D6).
        listStatus: row.doc.status ?? ("open" as const),
        approvedBy: row.doc.approvedBy,
      };
    });

    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Shopping-list item not found" });
      return;
    }
    if (outcome.status === "notManual") {
      res.status(400).json({ error: "Only manually added items can be edited" });
      return;
    }
    if (outcome.status === "conflict") {
      res.status(409).json({ error: "conflict", version: outcome.version, ...outcome.doc });
      return;
    }
    // After the commit, never blocking the response (design #104 D1).
    publishShoppingListEvent(
      {
        type: "shopping-list.changed",
        familyId,
        week: weekId,
        version: outcome.version,
        actor: userActor(user),
      },
      { status: outcome.listStatus, approvedBy: outcome.approvedBy },
    );
    res.json({ ...outcome.item, version: outcome.version });
  });

  router.post("/shopping-lists/items", validateBody(addItemSchema), async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const body = req.body as z.infer<typeof addItemSchema>;
    // Event emission happens inside addManualItems (shared with the machine API).
    const [created] = await addManualItems(db, familyId, weekId, [body], userActor(user));
    res.status(201).json(created);
  });

  // Trip state of the open list (design #104 D4, extended with `ready`).
  //   open ──"ready"──▶ ready ──"approved"──▶ approved ──"open"──▶ open
  //     └────────────"approved"────────────────▲   (or "Shopping done",
  //                                                 see /trips below)
  // Marking ready says "I've finished adding — anyone can shop this"; approving
  // claims the trip ("I'm going shopping") and records who + when; reopening
  // (cancel / back to editing) is allowed to any family member. A genuine
  // transition bumps the version so stale writers 409 with the current doc,
  // exactly like item writes — and approving an already-approved list 409s
  // too (someone beat you to the trip). Marking ready while someone is already
  // shopping is a satisfied intent (no-op), not a conflict.
  router.post("/shopping-lists/status", validateBody(statusSchema), async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const { status, baseVersion } = req.body as z.infer<typeof statusSchema>;

    const outcome = await db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      if (!row) return { status: "notFound" as const };
      if (baseVersion !== undefined && row.version !== baseVersion) {
        return { status: "conflict" as const, doc: row.doc, version: row.version };
      }
      const current = row.doc.status ?? "open";
      // The pre-write approver: a reopen notification targets whoever's trip
      // just ended, which the post-write doc no longer records (D6).
      const previousApprovedBy = row.doc.approvedBy;
      const now = new Date().toISOString();
      if (status === "approved") {
        if (current === "approved") {
          return { status: "conflict" as const, doc: row.doc, version: row.version };
        }
        clearStatusFields(row.doc);
        row.doc.status = "approved";
        row.doc.approvedBy = user.id;
        row.doc.approvedByEmail = user.email;
        row.doc.approvedAt = now;
      } else if (status === "ready") {
        if (current !== "open") {
          // Already ready, or someone is already out shopping it: the intent
          // is satisfied (e.g. an offline "ready" replayed late). No write.
          return { status: "noop" as const, doc: row.doc, version: row.version };
        }
        row.doc.status = "ready";
        row.doc.readyBy = user.id;
        row.doc.readyByEmail = user.email;
        row.doc.readyAt = now;
      } else {
        if (current === "open") {
          // Reopening an open list is a satisfied intent (e.g. an offline
          // "done" replayed after someone else already reopened): no write,
          // no version bump, no event.
          return { status: "noop" as const, doc: row.doc, version: row.version };
        }
        // Absent = open (back-compat), so clear every status field.
        clearStatusFields(row.doc);
      }
      await shoppingLists.updateDoc(trx, row.id, row.doc, { bumpVersion: true });
      return {
        status: "ok" as const,
        doc: row.doc,
        version: row.version + 1,
        previousApprovedBy,
      };
    });

    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Shopping list not found" });
      return;
    }
    if (outcome.status === "conflict") {
      res.status(409).json({ error: "conflict", version: outcome.version, ...outcome.doc });
      return;
    }
    if (outcome.status === "ok") {
      publishShoppingListEvent(
        {
          type: "shopping-list.status",
          familyId,
          week: weekId,
          version: outcome.version,
          actor: userActor(user),
        },
        status === "approved"
          ? { status: "approved", approvedBy: user.id }
          : status === "ready"
            ? { status: "ready" }
            : { status: "open", previousApprovedBy: outcome.previousApprovedBy },
      );
    }
    res.json({ ...outcome.doc, version: outcome.version });
  });

  // "Shopping done": archive the checked items as a completed trip and return
  // the open list (what is still to buy) to open. Lets a week be shopped in
  // several rounds instead of one list per week — see service/shoppingListTrips.
  router.post("/shopping-lists/trips", validateBody(completeTripSchema), async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const body = req.body as z.infer<typeof completeTripSchema>;

    const outcome = await completeShoppingTrip(db, familyId, weekId, body, user);
    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Shopping list not found" });
      return;
    }
    if (outcome.status === "conflict") {
      res.status(409).json({ error: "conflict", version: outcome.version, ...outcome.doc });
      return;
    }
    if (outcome.status === "ok") {
      publishShoppingListEvent(
        {
          type: "shopping-list.status",
          familyId,
          week: weekId,
          version: outcome.version,
          actor: userActor(user),
        },
        {
          status: "open",
          previousApprovedBy: outcome.previousApprovedBy,
          tripCompleted: { itemCount: outcome.trip?.items.length ?? 0 },
        },
      );
    }
    res.status(outcome.status === "ok" && outcome.trip ? 201 : 200).json({
      ...outcome.doc,
      version: outcome.version,
    });
  });

  // Undo a "Shopping done": the trip's items come back onto the open list
  // (still checked) and the trip leaves the history.
  router.delete("/shopping-lists/trips/:id", async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const tripId = requireUuidParam(req.params.id, res);
    if (!tripId) return;

    const outcome = await undoShoppingTrip(db, familyId, weekId, tripId);
    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Shopping trip not found" });
      return;
    }
    publishShoppingListEvent(
      {
        type: "shopping-list.changed",
        familyId,
        week: weekId,
        version: outcome.version,
        actor: userActor(user),
      },
      { status: outcome.doc.status ?? "open", approvedBy: outcome.doc.approvedBy },
    );
    res.json({ ...outcome.doc, version: outcome.version });
  });

  router.delete("/shopping-lists/items/:id", async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const weekId = resolveWeek(req.query.week);
    const itemId = requireUuidParam(req.params.id, res);
    if (!itemId) return;

    const outcome = await db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const item = row?.doc.items.find((i) => i.id === itemId);
      if (!row || !item) return { status: "notFound" as const };
      // Recipe-derived items would just reappear on the next sync.
      if (!item.manual) return { status: "notManual" as const };
      row.doc.items = row.doc.items.filter((i) => i.id !== itemId);
      await shoppingLists.updateDoc(trx, row.id, row.doc);
      // Deletes don't bump the version, so post-write it is the current one.
      return {
        status: "deleted" as const,
        version: row.version,
        listStatus: row.doc.status ?? ("open" as const),
        approvedBy: row.doc.approvedBy,
      };
    });

    if (outcome.status === "notFound") {
      res.status(404).json({ error: "Shopping-list item not found" });
      return;
    }
    if (outcome.status === "notManual") {
      res.status(400).json({ error: "Only manually added items can be deleted" });
      return;
    }
    publishShoppingListEvent(
      {
        type: "shopping-list.changed",
        familyId,
        week: weekId,
        version: outcome.version,
        actor: userActor(user),
      },
      { status: outcome.listStatus, approvedBy: outcome.approvedBy },
    );
    res.status(204).end();
  });

  return router;
}
