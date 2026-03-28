import { expect, test } from '@playwright/test'

import { mockEmptyRecipes, mockRecipeTagSuggestions } from './mock-api'

test('recipe tag field shows mocked suggestions and adds tag via keyboard', async ({ page }) => {
  await mockEmptyRecipes(page)
  await mockRecipeTagSuggestions(page, ['breakfast'])

  await page.goto('/recipes/new')
  const tags = page.getByRole('combobox', { name: /^Tags$/i })
  await tags.fill('br')
  await expect(page.getByRole('option', { name: 'breakfast' })).toBeVisible({ timeout: 10_000 })
  await tags.press('Enter')
  await expect(page.getByText('breakfast', { exact: true })).toBeVisible()
})

test('recipe tag field adds tag by clicking a suggestion', async ({ page }) => {
  await mockEmptyRecipes(page)
  await mockRecipeTagSuggestions(page, ['breakfast'])

  await page.goto('/recipes/new')
  const tags = page.getByRole('combobox', { name: /^Tags$/i })
  await tags.fill('br')
  await expect(page.getByRole('option', { name: 'breakfast' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('option', { name: 'breakfast' }).click()
  await expect(page.getByText('breakfast', { exact: true })).toBeVisible()
})

test('opening tag suggestions does not jump document scroll on a tall form', async ({ page }) => {
  await mockEmptyRecipes(page)
  await mockRecipeTagSuggestions(page, ['breakfast'])

  await page.setViewportSize({ width: 480, height: 560 })
  await page.goto('/recipes/new')

  const addIngredient = page.getByRole('button', { name: /Add ingredient/i })
  for (let i = 0; i < 22; i++) {
    await addIngredient.click()
  }

  await page.evaluate(() => {
    window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight))
  })

  const tags = page.getByRole('combobox', { name: /^Tags$/i })
  await tags.click()
  const scrollBefore = await page.evaluate(() => window.scrollY)

  await tags.fill('br')
  await expect(page.getByRole('option', { name: 'breakfast' })).toBeVisible({ timeout: 10_000 })

  const scrollAfter = await page.evaluate(() => window.scrollY)
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(150)
})
