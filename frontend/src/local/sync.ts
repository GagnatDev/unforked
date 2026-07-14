import { api } from '@/api'

import {
  putLocalMealPlan,
  putLocalRecipe,
  putLocalShoppingList,
  replaceLocalRecipes,
  setSyncMeta,
} from './db'

/**
 * Background pulls: fetch from the network and write into the local store.
 * These are the only phase-1 sync paths — pushes (outbox) arrive in phase 2.
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
  const doc = await api.mealPlans.getCurrent(weekId)
  await putLocalMealPlan(weekId, doc)
}

export async function pullShoppingList(weekId: string): Promise<void> {
  const doc = await api.shoppingList.get(weekId)
  await putLocalShoppingList(weekId, doc)
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
