import type { Page } from '@playwright/test'

/** Empty recipe list; matches list endpoint JSON shape used across mocked flows. */
export async function mockEmptyRecipes(page: Page): Promise<void> {
  await page.route('**/api/recipes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  })
}

const defaultCurrentMealPlan = {
  weekIdentifier: '2026-W13',
  assignments: [] as unknown[],
}

/** Stub `GET .../api/meal-plans/current` so the Today page loads when tests hit `/`. */
export async function mockCurrentMealPlan(
  page: Page,
  body: object = defaultCurrentMealPlan
): Promise<void> {
  await page.route('**/api/meal-plans/current**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

/**
 * Stub tag suggestions. Register after [mockEmptyRecipes] so this wins for `/api/recipes/tags`.
 */
export async function mockRecipeTagSuggestions(
  page: Page,
  allTags: string[]
): Promise<void> {
  await page.route('**/api/recipes/tags**', async (route) => {
    const url = new URL(route.request().url())
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const filtered = allTags.filter((t) => t.toLowerCase().startsWith(q))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filtered),
    })
  })
}
