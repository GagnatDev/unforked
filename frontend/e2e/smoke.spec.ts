import { expect, test } from '@playwright/test'

import { mockEmptyRecipes } from './mock-api'

test('loads app shell on home page', async ({ page }) => {
  await mockEmptyRecipes(page)

  await page.goto('/')
  await expect(page).toHaveTitle(/Meal Planning/i)
  await expect(page).toHaveURL(/\/$/)
})
