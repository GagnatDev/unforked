import { expect, test } from '@playwright/test'

test.describe('route error states', () => {
  test('recipes page keeps local UI usable and reports sync failure', async ({ page }) => {
    await page.route('**/api/recipes**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Recipes failed',
      })
    })

    await page.goto('/recipes')
    await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Sync paused', exact: true }).click()
    await expect(page.getByText('The server couldn’t sync. Try again shortly.')).toBeVisible()
    await expect(page.getByText('Keep working here. Changes are saved on this device.')).toBeVisible()
  })

  test('meal plan page keeps local UI usable and reports sync failure', async ({ page }) => {
    await page.route('**/api/meal-plans/current**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Meal plan failed',
      })
    })

    await page.goto('/meal-plan')
    await expect(page.getByRole('heading', { name: "This week's dinners", exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Sync paused', exact: true }).click()
    await expect(page.getByText('The server couldn’t sync. Try again shortly.')).toBeVisible()
    await expect(page.getByText('Keep working here. Changes are saved on this device.')).toBeVisible()
  })

  test('shopping list page keeps local UI usable and reports sync failure', async ({ page }) => {
    await page.route('**/api/shopping-lists**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Shopping list failed',
      })
    })

    await page.goto('/shopping-list')
    await expect(page.getByRole('heading', { name: 'Shopping list', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Sync paused', exact: true }).click()
    await expect(page.getByText('The server couldn’t sync. Try again shortly.')).toBeVisible()
    await expect(page.getByText('Keep working here. Changes are saved on this device.')).toBeVisible()
  })

  test('Today page keeps local UI usable and reports sync failure', async ({ page }) => {
    await page.route('**/api/meal-plans/current**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Today failed',
      })
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Sync paused', exact: true }).click()
    await expect(page.getByText('The server couldn’t sync. Try again shortly.')).toBeVisible()
    await expect(page.getByText('Keep working here. Changes are saved on this device.')).toBeVisible()
  })
})

