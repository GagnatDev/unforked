import type { Recipe, RecipeDoc } from '@/types'

import {
  appendOutboxOp,
  deleteLocalRecipe,
  type OutboxOp,
  type OutboxOpType,
  putLocalRecipe,
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

function recipeOp(type: OutboxOpType, key: string, payload?: RecipeDoc): OutboxOp {
  return {
    opId: uuid(),
    entity: 'recipe',
    type,
    key,
    payload,
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

/** Apply a recipe edit locally and queue the server update. */
export async function updateRecipe(id: string, doc: RecipeDoc): Promise<Recipe> {
  const recipe: Recipe = { id, doc }
  await putLocalRecipe(recipe)
  await appendOutboxOp(recipeOp('update', id, doc))
  kickOutboxSync()
  return recipe
}

/** Remove a recipe locally and queue the server delete. */
export async function deleteRecipe(id: string): Promise<void> {
  await deleteLocalRecipe(id)
  await appendOutboxOp(recipeOp('delete', id))
  kickOutboxSync()
}
