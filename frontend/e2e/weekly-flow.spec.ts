import { expect, test, type Route } from '@playwright/test'
import { selectMealPlanRecipe } from './meal-plan-select'

/** Must match [playwright.config.ts](playwright.config.ts) e2e backend port (see `E2E_BACKEND_PORT`). */
const backendOrigin =
  process.env.PLAYWRIGHT_API_ORIGIN ??
  `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '18080'}`

/** Frozen instant: calendar \"current\" week is 2026-W25; meal plan / shopping list default to next week (2026-W26). */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

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

    // Step one week back in the week strip, onto 2026-W25.
    const weekStrip = page.getByRole('group', { name: 'Select week' })
    await weekStrip.getByRole('button', { name: /^Previous week/ }).click()
    await expect(weekStrip.locator('button[aria-current="true"]')).toHaveAccessibleName(
      /Week 25, 2026/,
    )

    // 2) Assign the seeded recipe to Monday; the page saves it on its own.
    const mondayRow = page.getByRole('row', { name: /^Monday\b/i })
    const savePlanResponse = page.waitForResponse((response) => {
      return (
        response.request().method() === 'PUT' &&
        response.url().includes('/api/meal-plans/current')
      )
    })
    await selectMealPlanRecipe(mondayRow, recipeName)
    expect((await savePlanResponse).ok()).toBeTruthy()

    // 3) Visit the shopping list for the week just planned. The week is pinned
    // in the URL: without it the page picks a week itself (next week, or this
    // week when next week is empty), which a spec planning another week in
    // parallel could sway.
    const requestedShoppingUrls: string[] = []
    await page.route('**/api/shopping-lists**', async (route) => {
      requestedShoppingUrls.push(route.request().url())
      await route.continue()
    })

    await page.goto('/shopping-list?week=2026-W25')
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

    const shoppingWeekStrip = page.getByRole('group', { name: 'Select week' })
    await expect(
      shoppingWeekStrip.locator('button[aria-current="true"]'),
    ).toHaveAccessibleName(/Week 25, 2026/)

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

