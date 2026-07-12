import { expect, test } from '@playwright/test'

import { mockShoppingList, type MockShoppingListEntry } from './mock-api'

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

test('adds a manual item into its section', async ({ page }) => {
  const { requests } = await mockShoppingList(page, '2026-W13', WEEK_ITEMS)

  await page.goto('/shopping-list')
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()

  await page.getByLabel('Add item').fill('Toothpaste')
  await page.getByRole('button', { name: 'Add item' }).click()

  const other = page.getByRole('region', { name: 'Other' })
  await expect(other.getByText('Toothpaste')).toBeVisible()
  await expect
    .poll(() => requests.filter((r) => r.method === 'POST').map((r) => r.body))
    .toEqual([{ name: 'Toothpaste' }])
  await expect(page.getByLabel('Add item')).toHaveValue('')
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
