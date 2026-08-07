import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CategoryGroup } from '@/lib/shoppingCategories'
import type { ShoppingListEntry } from '@/types'
import { CategorySection } from './CategorySection'

vi.mock('./ShoppingItemRow', () => ({
  ShoppingItemRow: ({ item }: { item: ShoppingListEntry }) => (
    <li data-testid={`item-${item.id}`}>{item.name}</li>
  ),
}))

function entry(overrides: Partial<ShoppingListEntry>): ShoppingListEntry {
  return {
    id: 'item-1',
    name: 'Milk',
    quantity: '1',
    unit: 'l',
    recipeIds: [],
    category: 'dairy',
    checked: false,
    manual: false,
    ...overrides,
  }
}

const noop = () => {}

afterEach(() => {
  cleanup()
})

describe('CategorySection', () => {
  const group: CategoryGroup = {
    category: 'dairy',
    checkedCount: 1,
    totalCount: 2,
    items: [
      entry({ id: 'milk', name: 'Milk' }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ],
  }

  it('renders every item and category progress', () => {
    render(
      <CategorySection
        group={group}
        onToggle={noop}
        onChangeCategory={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    )

    expect(screen.getByRole('region', { name: 'Dairy & eggs' })).toBeTruthy()
    expect(screen.getByText('1/2')).toBeTruthy()
    expect(screen.getByTestId('item-milk')).toBeTruthy()
    expect(screen.getByTestId('item-butter')).toBeTruthy()
  })

  it('keeps full-group progress when checked rows were filtered out', () => {
    render(
      <CategorySection
        group={{ ...group, items: [entry({ id: 'milk', name: 'Milk' })] }}
        onToggle={noop}
        onChangeCategory={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    )

    expect(screen.getByText('1/2')).toBeTruthy()
    expect(screen.getByTestId('item-milk')).toBeTruthy()
    expect(screen.queryByTestId('item-butter')).toBeNull()
  })
})
