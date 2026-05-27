import { expect, test } from '@playwright/test'

import { mockCurrentMealPlan, mockEmptyRecipes } from './mock-api'

test.describe('Today load behavior', () => {
  test('shows empty state when API omits assignments field (no saved plan)', async ({
    page,
  }) => {
    await mockEmptyRecipes(page)
    await mockCurrentMealPlan(page, {
      weekIdentifier: '2026-W01',
    })

    await page.goto('/')
    await expect(
      page.getByText('No meal planned for today.', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Go to weekly menu' }),
    ).toBeVisible()
    await expect(page.getByText('Failed to fetch')).toHaveCount(0)
    await expect(
      page.getByText("Cannot read properties of undefined"),
    ).toHaveCount(0)
  })

  test('shows empty state when meal plan succeeds with no assignments', async ({
    page,
  }) => {
    await mockEmptyRecipes(page)
    await mockCurrentMealPlan(page, {
      weekIdentifier: '2026-W01',
      assignments: [],
    })

    await page.goto('/')
    await expect(
      page.getByText('No meal planned for today.', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Go to weekly menu' }),
    ).toBeVisible()
    await expect(page.getByText('Failed to fetch')).toHaveCount(0)
  })

  test('shows friendly copy when meal plan request fails at transport layer', async ({
    page,
  }) => {
    await page.route('**/api/meal-plans/current**', (route) => route.abort())

    await page.goto('/')
    await expect(
      page.getByText(
        'Could not reach the server. Check your connection and try again.',
      ),
    ).toBeVisible()
    await expect(page.getByText('Failed to fetch')).toHaveCount(0)
  })
})
