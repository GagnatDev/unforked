import { expect, test } from '@playwright/test'

import { mockEmptyRecipes } from './mock-api'

test('navigates to meal-plan page with mocked API dependencies', async ({ page }) => {
  // Keep this flow deterministic in phase 3 by mocking only required endpoints.
  await mockEmptyRecipes(page)
  await page.route('**/api/meal-plans/current**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekIdentifier: '2026-W13', assignments: [] }),
    })
  })

  await page.goto('/')
  await page.getByRole('link', { name: 'This week' }).click()

  await expect(page).toHaveURL(/\/meal-plan$/)
  await expect(page.getByRole('heading', { name: "This week's dinners" })).toBeVisible()
})

test('navigates to shopping-list page with mocked API dependencies', async ({ page }) => {
  // Keep this flow deterministic in phase 3 by mocking only required endpoints.
  await mockEmptyRecipes(page)
  await page.route('**/api/shopping-lists**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekIdentifier: '2026-W13', items: [] }),
    })
  })

  await page.goto('/')
  await page.getByRole('link', { name: 'Shopping list' }).click()

  await expect(page).toHaveURL(/\/shopping-list$/)
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()
})
