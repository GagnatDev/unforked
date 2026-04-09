import type { Locator } from '@playwright/test'

/** Meal plan recipe picker uses the shared Select (combobox), not a native `<select>`. */
export async function selectMealPlanRecipe(row: Locator, recipeName: string) {
  await row.getByRole('combobox').click()
  await row.page().getByRole('option', { name: recipeName }).click()
}
