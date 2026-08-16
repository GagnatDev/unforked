import type { Locator } from '@playwright/test'

/** Meal plan recipe picker uses the shared Select (combobox), not a native `<select>`. */
export async function selectMealPlanRecipe(row: Locator, recipeName: string) {
  await row.getByRole('combobox', { name: /^Recipe for /i }).click()
  await row.page().getByRole('option', { name: recipeName }).click()
}

/** Picks a head count (or the "clear" entry) from a people dropdown. */
export async function selectMealPlanPeople(picker: Locator, optionLabel: string) {
  await picker.click()
  await picker.page().getByRole('option', { name: optionLabel, exact: true }).click()
}
