import { expect, test } from '@playwright/test'

test.describe('route error states', () => {
  test('recipes page shows backend error message', async ({ page }) => {
    await page.route('**/api/recipes**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Recipes failed',
      })
    })

    await page.goto('/recipes')
    await expect(page.getByText('Recipes failed')).toBeVisible()
  })

  test('meal plan page shows backend error message', async ({ page }) => {
    await page.route('**/api/meal-plans/current**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Meal plan failed',
      })
    })

    await page.goto('/meal-plan')
    await expect(page.getByText('Meal plan failed')).toBeVisible()
  })

  test('shopping list page shows backend error message', async ({ page }) => {
    await page.route('**/api/shopping-lists**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Shopping list failed',
      })
    })

    await page.goto('/shopping-list')
    await expect(page.getByText('Shopping list failed')).toBeVisible()
  })

  test('Today page shows backend error message', async ({ page }) => {
    await page.route('**/api/meal-plans/current**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Today failed',
      })
    })

    await page.goto('/')
    await expect(page.getByText('Today failed')).toBeVisible()
  })
})

