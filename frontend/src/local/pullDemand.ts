import { rememberPullKey } from './db'
import { syncNow } from './outboxSync'
export { FAMILY_DEFAULT_PERSONS_KEY } from './sync'

/**
 * Views and realtime hints register durable demand, not independent GETs.
 * The leader's serialized push→pull runner services it even if the view unmounts.
 * Local reads/first paint never await this promise.
 */
export async function requestPull(key: string): Promise<void> {
  await rememberPullKey(key)
  await syncNow([key])
}
export const pullRecipes = () => requestPull('recipes')
export const pullRecipe = (id: string) => requestPull(`recipe:${id}`)
export const pullMealPlan = (week: string) => requestPull(`mealPlan:${week}`)
export const pullShoppingList = (week: string) => requestPull(`shopping:${week}`)
export const pullFamilyMealPlanDefaults = () => requestPull('familyDefaults').catch(() => {})
