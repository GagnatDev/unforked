import { expect, test } from '@playwright/test'

test('navigates to meal-plan page with mocked API dependencies', async ({ page }) => {
  // Keep this flow deterministic in phase 3 by mocking only required endpoints.
  await page.route('**/api/recipes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  })
  await page.route('**/api/meal-plans/current**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekIdentifier: '2026-W13', assignments: [] }),
    })
  })

  await page.goto('/')
  await page.locator('a[href="/meal-plan"]').click()

  await expect(page).toHaveURL(/\/meal-plan$/)
  await expect(page.locator('h1')).toBeVisible()
})

test('navigates to shopping-list page with mocked API dependencies', async ({ page }) => {
  // Keep this flow deterministic in phase 3 by mocking only required endpoints.
  await page.route('**/api/recipes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  })
  await page.route('**/api/shopping-lists**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekIdentifier: '2026-W13', items: [] }),
    })
  })

  await page.goto('/')
  await page.locator('a[href="/shopping-list"]').click()

  await expect(page).toHaveURL(/\/shopping-list$/)
  await expect(page.locator('h1')).toBeVisible()
})
