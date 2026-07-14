import { api } from '@/api'

import {
  listOutboxOps,
  type MealPlanOpPayload,
  putLocalMealPlan,
  putLocalRecipe,
  putLocalShoppingList,
  replaceLocalRecipes,
  setSyncMeta,
} from './db'
import { mergeMealPlan } from './mealPlanMerge'
import { applyShoppingOps } from './shoppingMerge'

/**
 * Background pulls: fetch from the network and write into the local store.
 *
 * Meal-plan and shopping-list pulls must not clobber edits still queued in the
 * outbox (offline-first spec A5): after fetching the server's version they
 * re-apply our pending, un-drained changes on top, so an offline add or a
 * not-yet-synced checked toggle survives a background refresh. Once the outbox
 * drains for a week there is nothing pending and the pull reflects the server
 * verbatim (including the server's re-categorization of synced items).
 */

/** syncMeta key holding the family's default meal-plan persons (display fallback). */
export const FAMILY_DEFAULT_PERSONS_KEY = 'family:defaultMealPlanPersons'

export async function pullRecipes(): Promise<void> {
  const recipes = await api.recipes.list()
  await replaceLocalRecipes(recipes)
}

export async function pullRecipe(id: string): Promise<void> {
  const recipe = await api.recipes.get(id)
  await putLocalRecipe(recipe)
}

export async function pullMealPlan(weekId: string): Promise<void> {
  const server = await api.mealPlans.getCurrent(weekId)
  const pending = (await listOutboxOps()).filter(
    (o) => o.entity === 'mealPlan' && o.key === weekId && o.parkedAt == null,
  )
  if (pending.length === 0) {
    await putLocalMealPlan(weekId, server)
    return
  }
  // Our net offline change is (first op's base) → (last op's doc); re-apply
  // its changed days onto the server's current plan.
  const first = pending[0].payload as MealPlanOpPayload
  const last = pending[pending.length - 1].payload as MealPlanOpPayload
  await putLocalMealPlan(weekId, mergeMealPlan(first.baseDoc, last.nextDoc, server, weekId))
}

export async function pullShoppingList(weekId: string): Promise<void> {
  const server = await api.shoppingList.get(weekId)
  const pending = (await listOutboxOps()).filter((o) => o.parkedAt == null)
  await putLocalShoppingList(weekId, applyShoppingOps(server, pending, weekId) ?? server)
}

/** The family default is optional context; failure is non-fatal by design. */
export async function pullFamilyMealPlanDefaults(): Promise<void> {
  try {
    const family = await api.family.get()
    await setSyncMeta(FAMILY_DEFAULT_PERSONS_KEY, family.defaultMealPlanPersons ?? null)
  } catch {
    // Keep whatever default we last saw; the meal-plan page works without it.
  }
}
