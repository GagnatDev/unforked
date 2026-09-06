import { api } from '@/api'
import { getFailedSyncKeys, trackSync } from './syncStatus'

// Session-observed keys survive page unmounts; WP3 can extend this with persisted keys.
const observedKeys = new Set<string>()
export const getObservedPullKeys = () => [...new Set([...observedKeys, ...getFailedSyncKeys()])]

function observedPull(key: string, work: () => Promise<void>): Promise<void> {
  observedKeys.add(key)
  return trackSync(key, work)
}

export const pullRecipes = () => observedPull('recipes', fetchRecipes)
export const pullRecipe = (id: string) => observedPull(`recipe:${id}`, () => fetchRecipe(id))
export const pullMealPlan = (week: string) => observedPull(`mealPlan:${week}`, () => fetchMealPlan(week))
export const pullShoppingList = (week: string) => observedPull(`shopping:${week}`, () => fetchShoppingList(week))
export const pullFamilyMealPlanDefaults = () => observedPull('familyDefaults', fetchFamilyMealPlanDefaults).catch(() => {})

/** Serializable keys, not mounted callbacks, let a follower request its own views. */
export async function retryPullKeys(keys: string[]): Promise<void> {
  for (const key of new Set(keys)) {
    try {
      if (key === 'recipes') await pullRecipes()
      else if (key === 'familyDefaults') await pullFamilyMealPlanDefaults()
      else if (key.startsWith('recipe:')) await pullRecipe(key.slice(7))
      else if (key.startsWith('mealPlan:')) await pullMealPlan(key.slice(9))
      else if (key.startsWith('shopping:')) await pullShoppingList(key.slice(9))
    } catch {
      // Each failed key keeps its outcome; continue reconciling independent views.
    }
  }
}

import {
  listOutboxOps,
  type MealPlanOpPayload,
  putLocalMealPlan,
  applyRecipePull,
  beginRecipePull,
  putLocalShoppingList,
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

async function fetchRecipes(): Promise<void> {
  const guard = await beginRecipePull()
  const recipes = await api.recipes.list()
  await applyRecipePull(recipes, true, guard)
}

async function fetchRecipe(id: string): Promise<void> {
  const guard = await beginRecipePull()
  const recipe = await api.recipes.get(id)
  await applyRecipePull([recipe], false, guard)
}

async function fetchMealPlan(weekId: string): Promise<void> {
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

async function fetchShoppingList(weekId: string): Promise<void> {
  const server = await api.shoppingList.get(weekId)
  const pending = (await listOutboxOps()).filter((o) => o.parkedAt == null)
  await putLocalShoppingList(weekId, applyShoppingOps(server, pending, weekId) ?? server)
}

/** The family default is optional context; failure is non-fatal by design. */
async function fetchFamilyMealPlanDefaults(): Promise<void> {
  const family = await api.family.get()
  await setSyncMeta(FAMILY_DEFAULT_PERSONS_KEY, family.defaultMealPlanPersons ?? null)
}
