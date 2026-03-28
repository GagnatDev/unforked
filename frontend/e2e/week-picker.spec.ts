import { expect, test, type Route } from '@playwright/test'

import { mockEmptyRecipes } from './mock-api'

/** Frozen instant: calendar "current" week is 2026-W25; meal plan / shopping list default to next week (2026-W26). */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

/** June 15, 2026 is in ISO week 2026-W25 (pick this to move back from default W26). */
const JUNE_15_DAY_BUTTON = /June 15th, 2026/

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test.describe('week picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: FROZEN_NOW })
    await mockEmptyRecipes(page)
  })

  test('meal plan: changing week refetches with new ?week= and updates trigger label', async ({
    page,
  }) => {
    const requestedUrls: string[] = []
    await page.route('**/api/meal-plans/current**', async (route) => {
      requestedUrls.push(route.request().url())
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
      await fulfillJson(route, {
        weekIdentifier: week,
        assignments: [],
      })
    })

    await page.goto('/meal-plan')
    await expect(page.getByRole('heading', { name: "This week's dinners" })).toBeVisible()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(1)
    expect(requestedUrls[0]).toContain('week=2026-W26')

    const trigger = page.getByRole('button', { name: /Week 26, 2026/ })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const weekDialog = page.getByRole('dialog', { name: /select week/i })
    await expect(weekDialog).toBeVisible()
    await weekDialog.getByRole('button', { name: JUNE_15_DAY_BUTTON }).click()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)
    expect(requestedUrls.at(-1)).toContain('week=2026-W25')
    await expect(page.getByRole('button', { name: /Week 25, 2026/ })).toBeVisible()
  })

  test('shopping list: changing week refetches with new ?week= and updates trigger label', async ({
    page,
  }) => {
    const requestedUrls: string[] = []
    await page.route('**/api/shopping-lists**', async (route) => {
      requestedUrls.push(route.request().url())
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
      await fulfillJson(route, {
        weekIdentifier: week,
        items: [],
      })
    })

    await page.goto('/shopping-list')
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(1)
    expect(requestedUrls[0]).toContain('week=2026-W26')

    const trigger = page.getByRole('button', { name: /Week 26, 2026/ })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const weekDialog = page.getByRole('dialog', { name: /select week/i })
    await expect(weekDialog).toBeVisible()
    await weekDialog.getByRole('button', { name: JUNE_15_DAY_BUTTON }).click()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)
    expect(requestedUrls.at(-1)).toContain('week=2026-W25')
    await expect(page.getByRole('button', { name: /Week 25, 2026/ })).toBeVisible()
  })
})
