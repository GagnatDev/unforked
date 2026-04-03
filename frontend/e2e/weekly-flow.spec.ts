import { expect, test, type Route } from '@playwright/test'

/** Must match [playwright.config.ts](playwright.config.ts) e2e backend port (see `E2E_BACKEND_PORT`). */
const backendOrigin =
  process.env.PLAYWRIGHT_API_ORIGIN ??
  `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '18080'}`

/** Frozen instant: calendar \"current\" week is 2026-W25; meal plan / shopping list default to next week (2026-W26). */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

/** June 15, 2026 is in ISO week 2026-W25 (used to switch week pickers from W26 → W25). */
const JUNE_15_DAY_BUTTON = /June 15th, 2026/

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test.describe('weekly flow (recipes → meal plan → shopping list → today)', { tag: '@integration' }, () => {
  test('user plans a week and sees it reflected in shopping list and Today view', async ({
    page,
    request,
  }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    await page.clock.install({ time: FROZEN_NOW })

    // Seed a simple recipe via backend with one ingredient and one step.
    const recipeName = `Weekly Flow Recipe ${Date.now()}`
    const createRes = await request.post(`${backendOrigin}/api/recipes`, {
      data: {
        name: recipeName,
        description: '',
        ingredients: [
          { name: 'pasta', quantity: '200', unit: 'g' },
        ],
        steps: ['Boil water', 'Cook pasta'],
        servings: 2,
        tags: [],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const created = (await createRes.json()) as { id: string }
    expect(created.id).toBeTruthy()

    // 1) Go to meal plan and switch week picker from default next week (W26) back to current week (W25).
    await page.goto('/meal-plan')
    await expect(
      page.getByRole('heading', { name: "This week's dinners" })
    ).toBeVisible()

    // Open week picker and choose June 15, 2026 (week 2026-W25).
    const trigger = page.getByRole('button', { name: /Week 26, 2026/ })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const weekDialog = page.getByRole('dialog', { name: /select week/i })
    await expect(weekDialog).toBeVisible()
    await weekDialog.getByRole('button', { name: JUNE_15_DAY_BUTTON }).click()

    // 2) Assign the seeded recipe to Monday and save the plan for week 2026-W25.
    const mondayRow = page.getByRole('row', { name: /^Monday\b/i })
    await mondayRow
      .getByRole('combobox')
      .selectOption({ label: recipeName })

    const savePlanResponse = page.waitForResponse((response) => {
      return (
        response.request().method() === 'PUT' &&
        response.url().includes('/api/meal-plans/current')
      )
    })
    await page.getByRole('button', { name: /save plan/i }).click()
    expect((await savePlanResponse).ok()).toBeTruthy()

    // 3) Visit shopping list, switch to the same week, and verify the ingredient appears.
    await page.goto('/shopping-list')
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

    const requestedShoppingUrls: string[] = []
    await page.route('**/api/shopping-lists**', async (route) => {
      requestedShoppingUrls.push(route.request().url())
      await route.continue()
    })

    const shoppingTrigger = page.getByRole('button', { name: /Week 26, 2026/ })
    await expect(shoppingTrigger).toBeVisible()
    await shoppingTrigger.click()

    const shoppingWeekDialog = page.getByRole('dialog', { name: /select week/i })
    await expect(shoppingWeekDialog).toBeVisible()
    await shoppingWeekDialog.getByRole('button', { name: JUNE_15_DAY_BUTTON }).click()

    // Expect at least one request for week W25 and a visible pasta line item.
    await expect
      .poll(() => requestedShoppingUrls.some((url) => url.includes('week=2026-W25')))
      .toBeTruthy()

    const pastaLine = page.getByRole('listitem').filter({ hasText: /^pasta/i })
    await expect(pastaLine).toBeVisible()

    // 4) Visit Today and ensure it reflects the planned meal for the current day/week.
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
    await expect(page.getByText(recipeName)).toBeVisible()
    await expect(page.getByText('Ingredients')).toBeVisible()
    await expect(page.getByText('Steps')).toBeVisible()

    // Ingredients/steps should render the seeded values.
    const todayIngredients = page
      .getByRole('heading', { name: 'Ingredients' })
      .locator('..')
    await expect(
      todayIngredients.getByText(/pasta/i)
    ).toBeVisible()
    await expect(page.getByText('Boil water')).toBeVisible()
    await expect(page.getByText('Cook pasta')).toBeVisible()

    expect(pageError).toBeUndefined()
  })
})

