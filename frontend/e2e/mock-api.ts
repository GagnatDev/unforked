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

/** A completed shopping round archived on the weekly doc. */
export interface MockShoppingTrip {
  id: string
  completedAt: string
  completedBy: string
  completedByEmail: string
  items: MockShoppingListEntry[]
}

/** Ready / "shopping now" fields carried on the mocked weekly doc (design #104 D4). */
export interface MockShoppingListStatus {
  status?: 'ready' | 'approved'
  approvedBy?: string
  approvedByEmail?: string
  approvedAt?: string
  readyBy?: string
  readyByEmail?: string
  readyAt?: string
  trips?: MockShoppingTrip[]
}

const DEV_USER_ID = '00000000-0000-4000-8000-000000000001'
const DEV_USER_EMAIL = 'dev@local.test'

/**
 * Stateful stub for the persisted shopping list: GET returns the current
 * items, PATCH/POST/DELETE on `/items` mutate them, POST on `/status` moves
 * the list between open / ready / approved, and POST/DELETE on `/trips`
 * archives the checked items as a completed trip or puts them back — like
 * the real API. Registered `/items`, `/status` and `/trips` routes win over
 * the broader GET route because Playwright matches the most recently
 * registered route first.
 */
export async function mockShoppingList(
  page: Page,
  weekIdentifier: string,
  initialItems: MockShoppingListEntry[],
  initialStatus: MockShoppingListStatus = {}
): Promise<{ requests: { method: string; url: string; body: unknown }[] }> {
  let items = initialItems.map((i) => ({ ...i }))
  const { trips: initialTrips = [], ...initialFlags } = initialStatus
  let tripStatus: Omit<MockShoppingListStatus, 'trips'> = { ...initialFlags }
  let trips: MockShoppingTrip[] = initialTrips.map((t) => ({ ...t, items: [...t.items] }))
  let version = 1
  const requests: { method: string; url: string; body: unknown }[] = []
  let manualSeq = 0

  const doc = () => ({ weekIdentifier, items, ...tripStatus, trips, version })

  // The read leaves `version` out so item writes stay plain `{ checked: true }`
  // style bodies in assertions; mutations return it like the real API does.
  await page.route('**/api/shopping-lists**', async (route) => {
    const { version: _omitted, ...read } = doc()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(read),
    })
  })

  await page.route('**/api/shopping-lists/status**', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as { status: 'approved' | 'ready' | 'open' }
    requests.push({ method: request.method(), url: request.url(), body })

    tripStatus =
      body.status === 'approved'
        ? {
            status: 'approved',
            approvedBy: DEV_USER_ID,
            approvedByEmail: DEV_USER_EMAIL,
            approvedAt: new Date().toISOString(),
          }
        : body.status === 'ready'
          ? {
              status: 'ready',
              readyBy: DEV_USER_ID,
              readyByEmail: DEV_USER_EMAIL,
              readyAt: new Date().toISOString(),
            }
          : {}
    version += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(doc()),
    })
  })

  await page.route('**/api/shopping-lists/trips**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = request.url()
    const body = method === 'DELETE' ? null : (request.postDataJSON() as unknown)
    requests.push({ method, url, body })

    if (method === 'POST') {
      const posted = body as { id: string; completedAt?: string }
      if (!trips.some((t) => t.id === posted.id)) {
        const bought = items.filter((i) => i.checked)
        items = items.filter((i) => !i.checked)
        tripStatus = {}
        if (bought.length > 0) {
          trips = [
            ...trips,
            {
              id: posted.id,
              completedAt: posted.completedAt ?? new Date().toISOString(),
              completedBy: DEV_USER_ID,
              completedByEmail: DEV_USER_EMAIL,
              items: bought,
            },
          ]
        }
        version += 1
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(doc()),
      })
      return
    }

    if (method === 'DELETE') {
      const id = new URL(url).pathname.split('/').pop()!
      const trip = trips.find((t) => t.id === id)
      if (!trip) {
        await route.fulfill({ status: 404, body: '{"error":"not found"}' })
        return
      }
      trips = trips.filter((t) => t.id !== id)
      items = [...items, ...trip.items]
      version += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(doc()),
      })
      return
    }
    await route.fallback()
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
