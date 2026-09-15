import { api } from '@/api'
import { sessionGuard } from '@/lib/localSession'
import { getFailedSyncKeys, trackSync } from './syncStatus'

// Observed keys survive page unmounts and are persisted for subsequent sessions.
const observedKeys = new Set<string>()
export const getObservedPullKeys = () => [...new Set([...observedKeys, ...getFailedSyncKeys()])]

function observedPull(key: string, work: () => Promise<void>): Promise<void> {
  observedKeys.add(key)
  return trackSync(key, async () => { sessionGuard(); await rememberPullKey(key); await work() })
}

export const pullRecipes = () => observedPull('recipes', fetchRecipes)
export const pullRecipe = (id: string) => observedPull(`recipe:${id}`, () => fetchRecipe(id))
export const pullMealPlan = (week: string) => observedPull(`mealPlan:${week}`, () => fetchMealPlan(week))
export const pullShoppingList = (week: string) => observedPull(`shopping:${week}`, () => fetchShoppingList(week))
export const pullFamilyMealPlanDefaults = () => observedPull('familyDefaults', fetchFamilyMealPlanDefaults).catch(() => {})

/** Serializable keys, not mounted callbacks, let a follower request its own views. */
export async function retryPullKeys(keys: string[]): Promise<void> {
  for (const key of new Set(keys)) {
    // A write can arrive while an earlier GET is pending. Never start the
    // next GET across queued intent; its mutation kick schedules a trailing
    // push-first pass. Parked intent never drains and is replayed onto each
    // pull, so it must not stop reconciliation.
    if ((await listPendingOutboxOps()).length > 0) return
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
  rememberPullKey,
  listPendingOutboxOps,
  beginWeekPull,
  applyWeekPull,
  applyRecipePull,
  beginRecipePull,
  setSyncMeta,
} from './db'
import { scheduleSync } from './outboxSync'

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
  const check = sessionGuard()
  const guard = await beginRecipePull()
  const recipes = await api.recipes.list()
  await applyRecipePull(recipes, true, guard, check)
}

async function fetchRecipe(id: string): Promise<void> {
  const check = sessionGuard()
  const guard = await beginRecipePull()
  const recipe = await api.recipes.get(id)
  await applyRecipePull([recipe], false, guard, check)
}

async function fetchMealPlan(weekId: string): Promise<void> {
  const check = sessionGuard()
  const guard = await beginWeekPull('mealPlans', weekId)
  const server = await api.mealPlans.getCurrent(weekId)
  if (!await applyWeekPull('mealPlans', weekId, server, guard, check)) scheduleSync([`mealPlan:${weekId}`])
}

async function fetchShoppingList(weekId: string): Promise<void> {
  const check = sessionGuard()
  const guard = await beginWeekPull('shoppingLists', weekId)
  const server = await api.shoppingList.get(weekId)
  if (!await applyWeekPull('shoppingLists', weekId, server, guard, check)) scheduleSync([`shopping:${weekId}`])
}

/** The family default is optional context; failure is non-fatal by design. */
async function fetchFamilyMealPlanDefaults(): Promise<void> {
  const check = sessionGuard()
  const family = await api.family.get()
  await setSyncMeta(FAMILY_DEFAULT_PERSONS_KEY, family.defaultMealPlanPersons ?? null, check)
}
