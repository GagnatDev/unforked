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
