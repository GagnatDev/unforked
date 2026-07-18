import { categorizeIngredient } from '@/lib/categorize'
import type { MealPlanDoc, Recipe, RecipeDoc, ShoppingListEntry } from '@/types'

import {
  appendOutboxOp,
  deleteLocalRecipe,
  getLocalMealPlan,
  getLocalRecipe,
  getLocalShoppingList,
  mutateLocalShoppingList,
  type OutboxOp,
  type OutboxOpType,
  putLocalMealPlan,
  putLocalRecipe,
  type ShoppingItemPatch,
} from './db'
import { kickOutboxSync } from './outboxSync'

/**
 * Optimistic domain mutations (offline-first spec A3/A4). Each write:
 *   1. applies to the local store immediately (the UI's source of truth),
 *   2. appends a durable outbox op, and
 *   3. kicks the sync engine to drain it when the network allows.
 *
 * Nothing awaits the server, so writes succeed offline and sync on reconnect.
 */

function uuid(): string {
  return crypto.randomUUID()
}

function recipeOp(
  type: OutboxOpType,
  key: string,
  payload?: unknown,
  baseVersion?: number,
): OutboxOp {
  return {
    opId: uuid(),
    entity: 'recipe',
    type,
    key,
    payload,
    baseVersion,
    createdAt: Date.now(),
    attempts: 0,
  }
}

/** Create a recipe locally with a client-minted id and queue the server create. */
export async function createRecipe(doc: RecipeDoc): Promise<Recipe> {
  const recipe: Recipe = { id: uuid(), doc }
  await putLocalRecipe(recipe)
  await appendOutboxOp(recipeOp('create', recipe.id, doc))
  kickOutboxSync()
  return recipe
}

/**
 * Apply a recipe edit locally and queue the server update. We snapshot the doc
 * and version we started from so the sync engine can field-merge on a `409`
 * (offline-first A5) and send `baseVersion` as the write precondition.
 */
export async function updateRecipe(id: string, doc: RecipeDoc): Promise<Recipe> {
  const existing = await getLocalRecipe(id)
  const baseDoc = existing?.doc ?? doc
  const recipe: Recipe = { id, doc, version: existing?.version }
  await putLocalRecipe(recipe)
  await appendOutboxOp(recipeOp('update', id, { baseDoc, nextDoc: doc }, existing?.version))
  kickOutboxSync()
  return recipe
}

/** Remove a recipe locally and queue the server delete. */
export async function deleteRecipe(id: string): Promise<void> {
  await deleteLocalRecipe(id)
  await appendOutboxOp(recipeOp('delete', id))
  kickOutboxSync()
}

// --- meal plans (whole-doc edits; day-level merge happens on sync) ---

/**
 * Save a whole-week meal plan optimistically and queue the server update.
 * We snapshot the plan we started from (`baseDoc`, read from the store before
 * applying the edit) alongside the new doc, so the sync engine can re-apply
 * only our changed days onto the server's current plan (see `mealPlanMerge.ts`).
 * When offline edits stack, each op's base is the previous op's doc, so the
 * merges compose.
 */
export async function saveMealPlan(weekId: string, nextDoc: MealPlanDoc): Promise<void> {
  const baseDoc: MealPlanDoc =
    (await getLocalMealPlan(weekId)) ?? { weekIdentifier: weekId, defaultPersons: null, assignments: [] }
  await putLocalMealPlan(weekId, nextDoc)
  await appendOutboxOp({
    opId: uuid(),
    entity: 'mealPlan',
    type: 'update',
    key: weekId,
    payload: { baseDoc, nextDoc },
    createdAt: Date.now(),
    attempts: 0,
  })
  kickOutboxSync()
}

// --- shopping-list items (per-item create/update/delete through the outbox) ---

function shoppingItemOp(
  type: OutboxOpType,
  itemId: string,
  payload: unknown,
  baseVersion?: number,
): OutboxOp {
  return {
    opId: uuid(),
    entity: 'shoppingItem',
    type,
    key: itemId,
    payload,
    baseVersion,
    createdAt: Date.now(),
    attempts: 0,
  }
}

/**
 * Add a manual shopping-list item offline: mint the item UUID (A4), categorize
 * it with the local heuristic (the server re-categorizes on sync), apply it to
 * the store, and queue the create. Returns the optimistic entry.
 */
export async function addShoppingItem(weekId: string, name: string): Promise<ShoppingListEntry> {
  const item: ShoppingListEntry = {
    id: uuid(),
    name,
    quantity: '',
    unit: '',
    recipeIds: [],
    category: categorizeIngredient(name),
    checked: false,
    manual: true,
  }
  await mutateLocalShoppingList(weekId, (doc) =>
    doc ? { ...doc, items: [...doc.items, item] } : { weekIdentifier: weekId, items: [item] },
  )
  await appendOutboxOp(shoppingItemOp('create', item.id, { weekId, item }))
  kickOutboxSync()
  return item
}

/** Apply a shopping-item patch (checked / category / content) locally and queue it. */
export async function patchShoppingItem(
  weekId: string,
  itemId: string,
  patch: ShoppingItemPatch,
): Promise<void> {
  // The list's current version is the PATCH precondition (offline-first A5);
  // a stale one yields a 409 that the sync engine recovers from.
  const baseVersion = (await getLocalShoppingList(weekId))?.version
  await mutateLocalShoppingList(weekId, (doc) =>
    doc ? { ...doc, items: doc.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : doc,
  )
  await appendOutboxOp(shoppingItemOp('update', itemId, { weekId, patch }, baseVersion))
  kickOutboxSync()
}

/** Remove a shopping-list item locally and queue the server delete. */
export async function deleteShoppingItem(weekId: string, itemId: string): Promise<void> {
  await mutateLocalShoppingList(weekId, (doc) =>
    doc ? { ...doc, items: doc.items.filter((i) => i.id !== itemId) } : doc,
  )
  await appendOutboxOp(shoppingItemOp('delete', itemId, { weekId }))
  kickOutboxSync()
}

// --- shopping-list approved / "shopping now" state (design #104 D4) ---

/**
 * Approve a week's list ("I'm going shopping") optimistically and queue the
 * status write. The approval metadata is minted here so the local doc (and any
 * pull-merge replay while the op is queued) shows who is shopping immediately;
 * the server's authoritative copy replaces it once the op drains and a pull
 * lands. A concurrent approval by someone else loses cleanly on the server
 * (409) and the next pull shows the actual approver.
 */
export async function approveShoppingList(
  weekId: string,
  approver: { id: string; email: string },
): Promise<void> {
  const baseVersion = (await getLocalShoppingList(weekId))?.version
  const approvedAt = new Date().toISOString()
  await mutateLocalShoppingList(weekId, (doc) =>
    doc
      ? {
          ...doc,
          status: 'approved',
          approvedBy: approver.id,
          approvedByEmail: approver.email,
          approvedAt,
        }
      : doc,
  )
  await appendOutboxOp({
    opId: uuid(),
    entity: 'shoppingStatus',
    type: 'update',
    key: weekId,
    payload: {
      weekId,
      status: 'approved',
      approvedBy: approver.id,
      approvedByEmail: approver.email,
      approvedAt,
    },
    baseVersion,
    createdAt: Date.now(),
    attempts: 0,
  })
  kickOutboxSync()
}

/** Reopen a week's list ("done shopping" / cancel) — allowed to any member. */
export async function reopenShoppingList(weekId: string): Promise<void> {
  const baseVersion = (await getLocalShoppingList(weekId))?.version
  await mutateLocalShoppingList(weekId, (doc) => {
    if (!doc) return doc
    // Absent = open (back-compat): strip all four fields, mirroring the server.
    const { status: _s, approvedBy: _b, approvedByEmail: _e, approvedAt: _a, ...open } = doc
    return open
  })
  await appendOutboxOp({
    opId: uuid(),
    entity: 'shoppingStatus',
    type: 'update',
    key: weekId,
    payload: { weekId, status: 'open' },
    baseVersion,
    createdAt: Date.now(),
    attempts: 0,
  })
  kickOutboxSync()
}
