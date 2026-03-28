import { expect, test, type Route } from '@playwright/test'

/** Frozen instant so `getCurrentWeekId()` is always 2026-W25 (see `timezoneId: 'UTC'` in config). */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

/** June 22, 2026 (UTC) is in ISO week 2026-W26; must match Calendar `data-day` (en-US). */
const JUNE_22_DATA_DAY = new Date(Date.UTC(2026, 5, 22, 12, 0, 0)).toLocaleDateString(
  'en-US',
  { timeZone: 'UTC' }
)

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
    await page.route('**/api/recipes**', (route) => fulfillJson(route, []))
  })

  test('meal plan: changing week refetches with new ?week= and updates trigger label', async ({
    page,
  }) => {
    const requestedUrls: string[] = []
    await page.route('**/api/meal-plans/current**', async (route) => {
      requestedUrls.push(route.request().url())
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W25'
      await fulfillJson(route, {
        weekIdentifier: week,
        assignments: [],
      })
    })

    await page.goto('/meal-plan')
    await expect(page.locator('h1')).toBeVisible()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(1)
    expect(requestedUrls[0]).toContain('week=2026-W25')

    const trigger = page.getByRole('button', { name: /Week 25, 2026/ })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover).toBeVisible()
    await popover.locator(`button[data-day="${JUNE_22_DATA_DAY}"]`).click()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)
    expect(requestedUrls.at(-1)).toContain('week=2026-W26')
    await expect(page.getByRole('button', { name: /Week 26, 2026/ })).toBeVisible()
  })

  test('shopping list: changing week refetches with new ?week= and updates trigger label', async ({
    page,
  }) => {
    const requestedUrls: string[] = []
    await page.route('**/api/shopping-lists**', async (route) => {
      requestedUrls.push(route.request().url())
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W25'
      await fulfillJson(route, {
        weekIdentifier: week,
        items: [],
      })
    })

    await page.goto('/shopping-list')
    await expect(page.locator('h1')).toBeVisible()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(1)
    expect(requestedUrls[0]).toContain('week=2026-W25')

    const trigger = page.getByRole('button', { name: /Week 25, 2026/ })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover).toBeVisible()
    await popover.locator(`button[data-day="${JUNE_22_DATA_DAY}"]`).click()

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)
    expect(requestedUrls.at(-1)).toContain('week=2026-W26')
    await expect(page.getByRole('button', { name: /Week 26, 2026/ })).toBeVisible()
  })
})
