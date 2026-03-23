import { expect, test } from '@playwright/test'

test('loads app shell on home page', async ({ page }) => {
  await page.route('**/api/recipes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  })

  await page.goto('/')
  await expect(page).toHaveTitle(/Meal Planning/i)
  await expect(page).toHaveURL(/\/$/)
})
