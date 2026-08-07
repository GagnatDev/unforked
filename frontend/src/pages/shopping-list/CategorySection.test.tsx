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
    items: [
      entry({ id: 'milk', name: 'Milk' }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ],
  }

  it('renders every item and category progress by default', () => {
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

  it('hides checked items while keeping full-group progress', () => {
    render(
      <CategorySection
        group={group}
        hideChecked
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

  it('renders nothing when every item is checked and hidden', () => {
    const { container } = render(
      <CategorySection
        group={{
          category: 'dairy',
          checkedCount: 1,
          items: [entry({ id: 'butter', name: 'Butter', checked: true })],
        }}
        hideChecked
        onToggle={noop}
        onChangeCategory={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    )

    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('region', { name: 'Dairy & eggs' })).toBeNull()
  })
})
