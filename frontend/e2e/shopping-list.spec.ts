import { expect, test, type Page } from '@playwright/test'

import { mockShoppingList, type MockShoppingListEntry } from './mock-api'
import { swipeRowOpen } from './swipe'

/** The raised week in the middle of the week strip. */
const selectedWeek = (page: Page) =>
  page.getByRole('group', { name: 'Select week' }).locator('button[aria-current="true"]')

function entry(overrides: Partial<MockShoppingListEntry>): MockShoppingListEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Milk',
    quantity: '1',
    unit: 'l',
    recipeIds: ['r1'],
    category: 'dairy',
    checked: false,
    manual: false,
    ...overrides,
  }
}

/** Frozen instant: this week is 2026-W25, so the list defaults to 2026-W26. */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

/** Answers each week from `byWeek`, so the two candidate weeks can differ. */
async function mockShoppingListByWeek(
  page: Page,
  byWeek: Record<string, MockShoppingListEntry[]>,
) {
  await page.route('**/api/shopping-lists**', async (route) => {
    const week = new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekIdentifier: week, items: byWeek[week] ?? [] }),
    })
  })
}

const WEEK_ITEMS: MockShoppingListEntry[] = [
  entry({ id: '11111111-1111-4111-8111-111111111111', name: 'Milk', category: 'dairy' }),
  entry({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Butter',
    quantity: '250',
    unit: 'g',
    category: 'dairy',
    checked: true,
  }),
  entry({
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Tomatoes',
    quantity: '3',
    unit: '',
    category: 'produce',
  }),
  entry({
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Chicken breast',
    quantity: '400',
    unit: 'g',
    category: 'meat',
  }),
]

test('groups items by store section in walk order with progress counts', async ({ page }) => {
  await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')

  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Fruit & vegetables',
    'Meat',
    'Dairy & eggs',
  ])

  const dairy = page.getByRole('region', { name: 'Dairy & eggs' })
  await expect(dairy.getByText('1/2')).toBeVisible()
  await expect(dairy.getByRole('listitem')).toHaveCount(2)
})

test('checking off an item PATCHes and strikes it through', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')

  const milkCheckbox = page.getByRole('checkbox', { name: 'Mark Milk as in cart' })
  await expect(milkCheckbox).not.toBeChecked()
  await milkCheckbox.click()

  await expect(milkCheckbox).toBeChecked()
  const dairy = page.getByRole('region', { name: 'Dairy & eggs' })
  await expect(dairy.getByText('2/2')).toBeVisible()
  await expect
    .poll(() => requests.filter((r) => r.method === 'PATCH').map((r) => r.body))
    .toEqual([{ checked: true }])
})

test('hide checked items filters rows and can be turned back off', async ({ page }) => {
  await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')

  const dairy = page.getByRole('region', { name: 'Dairy & eggs' })
  await expect(dairy.getByRole('listitem')).toHaveCount(2)
  await expect(dairy.getByText('Butter')).toBeVisible()

  await page.getByLabel('Hide checked items').check()

  await expect(dairy.getByRole('listitem')).toHaveCount(1)
  await expect(dairy.getByText('Milk')).toBeVisible()
  await expect(dairy.getByText('Butter')).toHaveCount(0)
  // Progress still reflects the full category, including hidden checked items.
  await expect(dairy.getByText('1/2')).toBeVisible()

  await page.getByLabel('Hide checked items').uncheck()
  await expect(dairy.getByRole('listitem')).toHaveCount(2)
  await expect(dairy.getByText('Butter')).toBeVisible()
})

test('adds a manual item into its section', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

  await page.getByLabel('Add item').fill('Toothpaste')
  await page.getByRole('button', { name: 'Add item' }).click()

  const other = page.getByRole('region', { name: 'Other' })
  await expect(other.getByText('Toothpaste')).toBeVisible()
  // Offline-first: the client mints the item id and POSTs it (the drain runs in
  // the background); category is left to the server to (re)assign on sync.
  await expect.poll(() => requests.filter((r) => r.method === 'POST').length).toBe(1)
  const posted = requests.find((r) => r.method === 'POST')!.body as {
    id: string
    name: string
  }
  expect(posted.name).toBe('Toothpaste')
  expect(posted.id).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByLabel('Add item')).toHaveValue('')
})

test('edits a manual item via the pencil button and PATCHes the change', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', [
    entry({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Coffee',
      quantity: '1',
      unit: 'bag',
      recipeIds: [],
      category: 'beverages',
      manual: true,
    }),
  ])

  await page.goto('/shopping-list')

  const beverages = page.getByRole('region', { name: 'Beverages' })
  await beverages.getByRole('button', { name: 'Edit Coffee' }).click()

  await page.getByLabel('Name').fill('Ground coffee')
  await page.getByLabel('Quantity').fill('2')
  await page.getByLabel('Unit').fill('bags')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(beverages.getByText('Ground coffee')).toBeVisible()
  await expect(beverages.getByText('2 bags')).toBeVisible()
  await expect
    .poll(() => requests.filter((r) => r.method === 'PATCH').map((r) => r.body))
    .toEqual([{ name: 'Ground coffee', quantity: '2', unit: 'bags' }])
})

test('cancelling an edit leaves the item untouched', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', [
    entry({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Coffee',
      recipeIds: [],
      category: 'beverages',
      manual: true,
    }),
  ])

  await page.goto('/shopping-list')

  const beverages = page.getByRole('region', { name: 'Beverages' })
  await beverages.getByRole('button', { name: 'Edit Coffee' }).click()
  await page.getByLabel('Name').fill('Tea')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(beverages.getByText('Coffee')).toBeVisible()
  expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0)
})

test('swiping a manual item left reveals a trash panel that removes it', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', [
    entry({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Coffee',
      recipeIds: [],
      category: 'beverages',
      manual: true,
    }),
  ])

  await page.goto('/shopping-list')

  const beverages = page.getByRole('region', { name: 'Beverages' })
  const row = beverages.getByRole('listitem').filter({ hasText: 'Coffee' })
  await expect(row).toBeVisible()

  await swipeRowOpen(page, row)

  // The swipe only reveals the panel — nothing is removed until it is pressed.
  await expect(row.locator('[data-swipe-state]')).toHaveAttribute('data-swipe-state', 'open')
  await expect(beverages.getByText('Coffee')).toBeVisible()
  expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(0)

  await row.getByRole('button', { name: 'Remove Coffee' }).click()

  await expect(beverages.getByText('Coffee')).toHaveCount(0)
  await expect.poll(() => requests.filter((r) => r.method === 'DELETE').length).toBe(1)
})

test('recipe items cannot be swiped away', async ({ page }) => {
  await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')

  const dairy = page.getByRole('region', { name: 'Dairy & eggs' })
  const row = dairy.getByRole('listitem').filter({ hasText: 'Milk' })
  await swipeRowOpen(page, row)

  await expect(row).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Remove Milk' })).toHaveCount(0)
})

test('recipe items offer no edit control', async ({ page }) => {
  await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')

  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Milk' })).toHaveCount(0)
})

/** Status values POSTed to `/status`, in order, as the outbox drains. */
const statusWrites = (requests: { url: string; body: unknown }[]) =>
  requests.filter((r) => r.url.includes('/status')).map((r) => (r.body as { status: string }).status)

test('approving shows the persistent banner and cancelling clears it (design #104 D4)', async ({
  page,
}) => {
  const { requests } = await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

  // Approve: the optimistic banner names the signed-in shopper immediately.
  // Several global indicators also carry role="status", so scope by content.
  await page.getByRole('button', { name: "I'm going shopping" }).click()
  const banner = page.getByRole('status').filter({ hasText: 'is shopping' })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('dev@local.test is shopping')
  await expect(page.getByRole('button', { name: "I'm going shopping" })).toHaveCount(0)
  // The status write drains through the outbox in the background.
  await expect.poll(() => statusWrites(requests)).toEqual(['approved'])

  // Items stay fully usable while the list is approved.
  const milkCheckbox = page.getByRole('checkbox', { name: 'Mark Milk as in cart' })
  await milkCheckbox.click()
  await expect(milkCheckbox).toBeChecked()

  // Cancel: the banner goes, the action returns, nothing is archived.
  await page.getByRole('button', { name: 'Cancel trip' }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.getByRole('button', { name: "I'm going shopping" })).toBeVisible()
  await expect(milkCheckbox).toBeChecked()
  await expect(page.getByRole('region', { name: 'Bought this week' })).toHaveCount(0)
  await expect.poll(() => statusWrites(requests)).toEqual(['approved', 'open'])
})

test('a list already approved by someone else shows their banner on load', async ({ page }) => {
  await mockShoppingList(page, '2026-W13', WEEK_ITEMS, {
    status: 'approved',
    approvedBy: '99999999-9999-4999-8999-999999999999',
    approvedByEmail: 'partner@example.com',
    approvedAt: new Date().toISOString(),
  })

  await page.goto('/shopping-list')

  const banner = page.getByRole('status').filter({ hasText: 'is shopping' })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('partner@example.com is shopping')
  await expect(page.getByRole('button', { name: "I'm going shopping" })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Shopping done' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel trip' })).toBeVisible()
})

test.describe('shopping a week in several trips', () => {
  test('marking the list ready shows who finished it, and can be taken back', async ({ page }) => {
    const { requests } = await mockShoppingList(page, '2026-W13', [
      entry({ id: '11111111-1111-4111-8111-111111111111', name: 'Milk' }),
      entry({ id: '33333333-3333-4333-8333-333333333333', name: 'Tomatoes', category: 'produce' }),
    ])

    await page.goto('/shopping-list')
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

    await page.getByRole('button', { name: 'Ready to shop' }).click()
    const banner = page.getByRole('status').filter({ hasText: 'finished the list' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Ready to shop — dev@local.test finished the list')
    // The shopper can still claim it; the planner can still take it back.
    await expect(page.getByRole('button', { name: "I'm going shopping" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ready to shop' })).toHaveCount(0)
    await expect.poll(() => statusWrites(requests)).toEqual(['ready'])

    await page.getByRole('button', { name: 'Back to editing' }).click()
    await expect(banner).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ready to shop' })).toBeVisible()
    await expect.poll(() => statusWrites(requests)).toEqual(['ready', 'open'])
  })

  test('a list someone else marked ready shows their banner on load', async ({ page }) => {
    await mockShoppingList(page, '2026-W13', WEEK_ITEMS, {
      status: 'ready',
      readyBy: '99999999-9999-4999-8999-999999999999',
      readyByEmail: 'partner@example.com',
      readyAt: new Date().toISOString(),
    })

    await page.goto('/shopping-list')

    const banner = page.getByRole('status').filter({ hasText: 'finished the list' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('partner@example.com finished the list')
    await expect(page.getByRole('button', { name: "I'm going shopping" })).toBeVisible()
  })

  test('shopping done archives the checked items as a trip and leaves the rest to buy', async ({
    page,
  }) => {
    const { requests } = await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

    await page.goto('/shopping-list')
    await expect(page.getByText('4 to buy')).toBeVisible()

    await page.getByRole('button', { name: "I'm going shopping" }).click()
    await page.getByRole('checkbox', { name: 'Mark Milk as in cart' }).click()
    await page.getByRole('button', { name: 'Shopping done' }).click()

    // Milk and the pre-checked Butter are bought; Tomatoes and Chicken stay open.
    await expect(page.getByText('2 to buy · 2 bought this week')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Dairy & eggs' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Fruit & vegetables' }).getByText('Tomatoes')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Meat' }).getByText('Chicken breast')).toBeVisible()
    // The claim is released, so the next round starts from a clean card.
    await expect(page.getByRole('status').filter({ hasText: 'is shopping' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: "I'm going shopping" })).toBeVisible()

    const history = page.getByRole('region', { name: 'Bought this week' })
    await expect(history).toBeVisible()
    await expect(history.getByText('Trip 1')).toBeVisible()
    await expect(history.getByText('dev@local.test', { exact: false })).toBeVisible()
    await history.getByLabel('Show items bought on trip 1').click()
    await expect(history.getByText('Milk')).toBeVisible()
    await expect(history.getByText('Butter')).toBeVisible()

    // Offline-first: the client mints the trip id and POSTs it in the background.
    await expect.poll(() => requests.filter((r) => r.url.includes('/trips')).length).toBe(1)
    const posted = requests.find((r) => r.url.includes('/trips'))!
    expect(posted.method).toBe('POST')
    expect((posted.body as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('a quick top-up: shopping done needs no claim once something is in the cart', async ({
    page,
  }) => {
    const { requests } = await mockShoppingList(page, '2026-W13', [
      entry({ id: '11111111-1111-4111-8111-111111111111', name: 'Milk' }),
      entry({ id: '33333333-3333-4333-8333-333333333333', name: 'Tomatoes', category: 'produce' }),
    ])

    await page.goto('/shopping-list')
    // Nothing ticked yet: the secondary action is about finishing the plan.
    await expect(page.getByRole('button', { name: 'Ready to shop' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Shopping done' })).toHaveCount(0)

    await page.getByRole('checkbox', { name: 'Mark Tomatoes as in cart' }).click()
    await expect(page.getByRole('button', { name: 'Shopping done' })).toBeVisible()
    await page.getByRole('button', { name: 'Shopping done' }).click()

    await expect(page.getByText('1 to buy · 1 bought this week')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Bought this week' }).getByText('Trip 1')).toBeVisible()
    await expect.poll(() => requests.filter((r) => r.url.includes('/trips')).length).toBe(1)
    expect(statusWrites(requests)).toEqual([])
  })

  test('undoing a trip puts its items back on the list, still checked', async ({ page }) => {
    const bought = [
      entry({ id: '11111111-1111-4111-8111-111111111111', name: 'Milk', checked: true }),
      entry({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Butter',
        quantity: '250',
        unit: 'g',
        checked: true,
      }),
    ]
    const { requests } = await mockShoppingList(
      page,
      '2026-W13',
      [entry({ id: '33333333-3333-4333-8333-333333333333', name: 'Tomatoes', category: 'produce' })],
      {
        trips: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            completedAt: new Date().toISOString(),
            completedBy: '99999999-9999-4999-8999-999999999999',
            completedByEmail: 'partner@example.com',
            items: bought,
          },
        ],
      },
    )

    await page.goto('/shopping-list')
    await expect(page.getByText('1 to buy · 2 bought this week')).toBeVisible()

    const history = page.getByRole('region', { name: 'Bought this week' })
    await expect(history.getByText('partner@example.com', { exact: false })).toBeVisible()
    await history.getByLabel('Show items bought on trip 1').click()
    await history.getByRole('button', { name: 'Put the items from trip 1 back on the list' }).click()

    await expect(history).toHaveCount(0)
    await expect(page.getByText('3 to buy')).toBeVisible()
    const dairy = page.getByRole('region', { name: 'Dairy & eggs' })
    await expect(dairy.getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('checkbox', { name: 'Mark Milk as in cart' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Mark Butter as in cart' })).toBeChecked()
    await expect
      .poll(() => requests.filter((r) => r.url.includes('/trips')).map((r) => r.method))
      .toEqual(['DELETE'])
  })

  test('when everything has been bought, the empty state says so instead of "nothing planned"', async ({
    page,
  }) => {
    await mockShoppingList(page, '2026-W13', [], {
      trips: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          completedAt: new Date().toISOString(),
          completedBy: '00000000-0000-4000-8000-000000000001',
          completedByEmail: 'dev@local.test',
          items: [entry({ name: 'Milk', checked: true })],
        },
      ],
    })

    await page.goto('/shopping-list')

    await expect(page.getByText(/Everything on the list has been bought/)).toBeVisible()
    await expect(page.getByText(/No ingredients for the selected week/)).toHaveCount(0)
    await expect(page.getByText('1 bought this week')).toBeVisible()
    // A forgotten item can still be added for an ad-hoc top-up trip.
    await expect(page.getByLabel('Add item')).toBeVisible()
  })
})

test('changing category moves the item to the other section', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')

  await page.getByRole('button', { name: 'Change category for Milk' }).click()
  await page.getByRole('menuitemradio', { name: 'Beverages' }).click()

  const beverages = page.getByRole('region', { name: 'Beverages' })
  await expect(beverages.getByText('Milk')).toBeVisible()
  const dairy = page.getByRole('region', { name: 'Dairy & eggs' })
  await expect(dairy.getByRole('listitem')).toHaveCount(1)
  await expect
    .poll(() => requests.filter((r) => r.method === 'PATCH').map((r) => r.body))
    .toEqual([{ category: 'beverages' }])
})
test.describe('default week', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: FROZEN_NOW })
  })

  test('opens next week, the week being shopped for', async ({ page }) => {
    await mockShoppingListByWeek(page, {
      '2026-W25': [entry({ name: 'Bread' })],
      '2026-W26': [entry({ name: 'Milk' })],
    })

    await page.goto('/shopping-list')

    await expect(selectedWeek(page)).toContainText('Next week')
    await expect(page.getByText('Milk')).toBeVisible()
    await expect(page.getByText('Bread')).toBeHidden()
  })

  test('opens this week instead when next week is empty', async ({ page }) => {
    await mockShoppingListByWeek(page, { '2026-W25': [entry({ name: 'Bread' })] })

    await page.goto('/shopping-list')

    await expect(selectedWeek(page)).toContainText('This week')
    await expect(page.getByText('Bread')).toBeVisible()
  })

  test('honours the week in ?week= even when that list is empty', async ({ page }) => {
    await mockShoppingListByWeek(page, { '2026-W25': [entry({ name: 'Bread' })] })

    await page.goto('/shopping-list?week=2026-W30')

    await expect(selectedWeek(page)).toHaveAccessibleName(/Week 30, 2026/)
    await expect(page.getByText(/No ingredients for the selected week/)).toBeVisible()
  })
})
