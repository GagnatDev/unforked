import { expect, test, type Page, type Route } from '@playwright/test'

import { mockEmptyRecipes } from './mock-api'
import { swipeHorizontally } from './swipe'

/** Frozen instant: calendar "current" week is 2026-W25; meal plan / shopping list default to next week (2026-W26). */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const weekStrip = (page: Page) => page.getByRole('group', { name: 'Select week' })

/** The raised week in the middle of the strip. */
const selectedWeek = (page: Page) => weekStrip(page).locator('button[aria-current="true"]')

test.describe('week picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: FROZEN_NOW })
    await mockEmptyRecipes(page)
  })

  test('meal plan: tapping the week before refetches it and moves the selection', async ({
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

    await test.step('load meal plan for the default week (2026-W26)', async () => {
      await page.goto('/meal-plan')
      await expect(page.getByRole('heading', { name: "This week's dinners" })).toBeVisible()

      await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(1)
      expect(requestedUrls[0]).toContain('week=2026-W26')
      await expect(selectedWeek(page)).toHaveAccessibleName(/Week 26, 2026/)
    })

    await test.step('tap the previous week (2026-W25)', async () => {
      await weekStrip(page).getByRole('button', { name: /^Previous week/ }).click()
    })

    await test.step('refetch with week=2026-W25 and raise it in the strip', async () => {
      await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)
      expect(requestedUrls.at(-1)).toContain('week=2026-W25')
      await expect(selectedWeek(page)).toHaveAccessibleName(/Week 25, 2026/)
      // W25 is the week the frozen clock is in, so it now reads as "this week".
      await expect(selectedWeek(page)).toContainText('This week')
    })
  })

  test('meal plan: swiping the strip left moves to the week after', async ({ page }) => {
    const requestedUrls: string[] = []
    await page.route('**/api/meal-plans/current**', async (route) => {
      requestedUrls.push(route.request().url())
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
      await fulfillJson(route, { weekIdentifier: week, assignments: [] })
    })

    await page.goto('/meal-plan')
    await expect(selectedWeek(page)).toHaveAccessibleName(/Week 26, 2026/)

    await swipeHorizontally(page, weekStrip(page), -120)

    await expect(selectedWeek(page)).toHaveAccessibleName(/Week 27, 2026/)
    await expect.poll(() => requestedUrls.at(-1)).toContain('week=2026-W27')
  })

  test('shopping list: changing week refetches it and updates ?week=', async ({ page }) => {
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

    await test.step('load shopping list for the default week (2026-W26)', async () => {
      await page.goto('/shopping-list')
      await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

      await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(1)
      expect(requestedUrls[0]).toContain('week=2026-W26')
    })

    await test.step('tap the previous week (2026-W25)', async () => {
      await weekStrip(page).getByRole('button', { name: /^Previous week/ }).click()

      await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)
      expect(requestedUrls.at(-1)).toContain('week=2026-W25')
      await expect(selectedWeek(page)).toHaveAccessibleName(/Week 25, 2026/)
      // The viewed week lives in the URL, so the list is linkable.
      await expect(page).toHaveURL(/\?week=2026-W25$/)
    })

    await test.step('swipe right to go back another week (2026-W24)', async () => {
      await swipeHorizontally(page, weekStrip(page), 120)

      await expect(selectedWeek(page)).toHaveAccessibleName(/Week 24, 2026/)
      await expect(page).toHaveURL(/\?week=2026-W24$/)
    })
  })

  test('arrow keys step a week once the strip has focus', async ({ page }) => {
    await page.route('**/api/shopping-lists**', async (route) => {
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
      await fulfillJson(route, { weekIdentifier: week, items: [] })
    })

    await page.goto('/shopping-list')
    await selectedWeek(page).focus()

    await page.keyboard.press('ArrowRight')
    await expect(selectedWeek(page)).toHaveAccessibleName(/Week 27, 2026/)

    await page.keyboard.press('ArrowLeft')
    await expect(selectedWeek(page)).toHaveAccessibleName(/Week 26, 2026/)
  })
})
