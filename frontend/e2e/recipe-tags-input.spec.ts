import { expect, test } from '@playwright/test'

import { mockEmptyRecipes, mockRecipeTagSuggestions } from './mock-api'

test('recipe tag field shows mocked suggestions and adds tag via keyboard', async ({ page }) => {
  await mockEmptyRecipes(page)
  await mockRecipeTagSuggestions(page, ['breakfast'])

  await page.goto('/recipes/new')
  const tags = page.getByRole('textbox', { name: /^Tags$/i })
  await tags.fill('br')
  await expect(page.getByRole('option', { name: 'breakfast' })).toBeVisible({ timeout: 10_000 })
  await tags.press('Enter')
  await expect(page.getByText('breakfast', { exact: true })).toBeVisible()
})
