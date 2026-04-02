import { expect, test } from '@playwright/test'

/**
 * Backend may omit `warnings` when empty (kotlinx.serialization default encoding).
 * The import UI must not crash when `warnings` is missing from JSON.
 */
test('import from URL dialog fills new recipe form when API omits warnings array', async ({ page }) => {
  let pageError: Error | undefined
  page.on('pageerror', (e) => {
    pageError = e
  })

  await page.route('**/api/recipes/import', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        doc: {
          name: 'Mock imported recipe',
          description: 'From stub',
          ingredients: [{ name: 'flour', quantity: '200', unit: 'g' }],
          steps: ['Mix and bake'],
          servings: 4,
          tags: [],
        },
      }),
    })
  })

  await page.goto('/recipes/new')
  await expect(page).toHaveURL(/\/recipes\/new$/)

  await page.getByRole('button', { name: /Import from URL/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByPlaceholder(/https:\/\//i).fill('https://example.com/recipe')
  await dialog.getByRole('button', { name: /^Import$/ }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Name$/i })).toHaveValue('Mock imported recipe')
  expect(pageError).toBeUndefined()
})
