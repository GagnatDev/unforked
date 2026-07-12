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

export interface MockShoppingListEntry {
  id: string
  name: string
  quantity: string
  unit: string
  recipeIds: string[]
  category: string
  checked: boolean
  manual: boolean
}

/**
 * Stateful stub for the persisted shopping list: GET returns the current
 * items, PATCH/POST/DELETE on `/items` mutate them like the real API.
 * Registered `/items` routes win over the broader GET route because Playwright
 * matches the most recently registered route first.
 */
export async function mockShoppingList(
  page: Page,
  weekIdentifier: string,
  initialItems: MockShoppingListEntry[]
): Promise<{ requests: { method: string; url: string; body: unknown }[] }> {
  let items = initialItems.map((i) => ({ ...i }))
  const requests: { method: string; url: string; body: unknown }[] = []
  let manualSeq = 0

  await page.route('**/api/shopping-lists**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekIdentifier, items }),
    })
  })

  await page.route('**/api/shopping-lists/items**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = request.url()
    const body = method === 'DELETE' ? null : (request.postDataJSON() as unknown)
    requests.push({ method, url, body })

    if (method === 'POST') {
      const posted = body as { name: string; category?: string }
      manualSeq += 1
      const entry: MockShoppingListEntry = {
        id: `00000000-0000-4000-8000-00000000000${manualSeq}`,
        name: posted.name,
        quantity: '',
        unit: '',
        recipeIds: [],
        category: posted.category ?? 'other',
        checked: false,
        manual: true,
      }
      items = [...items, entry]
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(entry),
      })
      return
    }

    const id = new URL(url).pathname.split('/').pop()!
    if (method === 'PATCH') {
      const patch = body as Partial<MockShoppingListEntry>
      const entry = items.find((i) => i.id === id)
      if (!entry) {
        await route.fulfill({ status: 404, body: '{"error":"not found"}' })
        return
      }
      Object.assign(entry, patch)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entry),
      })
      return
    }
    if (method === 'DELETE') {
      items = items.filter((i) => i.id !== id)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fallback()
  })

  return { requests }
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
