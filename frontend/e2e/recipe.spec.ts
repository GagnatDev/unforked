import { expect, test } from '@playwright/test'

test('creates a recipe through the frontend form and persists via real backend', async ({ page }) => {
  const recipeName = `Playwright Recipe ${Date.now()}`
  await page.goto('/recipes/new')
  await page.locator('form input').first().fill(recipeName)

  const createResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
  })
  await page.locator('form button[type="submit"]').click()

  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBeTruthy()
  const payload = await createResponse.json()
  expect(payload.id).toBeTruthy()
  expect(payload.doc?.name).toBe(recipeName)

  await expect(page).toHaveURL(new RegExp(`/recipes/${payload.id}/edit$`))
})
