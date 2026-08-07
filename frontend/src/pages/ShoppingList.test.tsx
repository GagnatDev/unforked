import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { ShoppingListEntry } from '@/types'

const mocks = vi.hoisted(() => ({ useShoppingList: vi.fn() }))

vi.mock('./shopping-list/useShoppingList', () => ({
  useShoppingList: mocks.useShoppingList,
}))

// The week picker and add form are exercised elsewhere; keep this focused on
// which rows the page decides to render.
vi.mock('@/components/WeekPicker', () => ({ WeekPicker: () => null }))
vi.mock('./shopping-list/AddItemForm', () => ({ AddItemForm: () => null }))

import ShoppingList from './ShoppingList'

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

function renderPage(items: ShoppingListEntry[]) {
  mocks.useShoppingList.mockReturnValue({
    items,
    loading: false,
    error: null,
    adding: false,
    status: 'draft',
    approvedByEmail: null,
    approvedAt: null,
    toggleChecked: () => {},
    changeCategory: () => {},
    editItem: () => {},
    addItem: () => {},
    deleteItem: () => {},
    approve: () => {},
    reopen: () => {},
  })
  return render(
    <MemoryRouter>
      <ShoppingList />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ShoppingList hide-checked toggle', () => {
  it('hides checked rows and keeps category progress', () => {
    renderPage([
      entry({ id: 'milk', name: 'Milk' }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ])

    expect(screen.getByText('Butter')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Hide checked items'))

    expect(screen.queryByText('Butter')).toBeNull()
    expect(screen.getByText('Milk')).toBeTruthy()
    expect(screen.getByText('1/2')).toBeTruthy()
  })

  it('explains the empty view when everything is checked and hidden', () => {
    renderPage([entry({ id: 'butter', name: 'Butter', checked: true })])

    fireEvent.click(screen.getByLabelText('Hide checked items'))

    expect(screen.queryByRole('region', { name: 'Dairy & eggs' })).toBeNull()
    expect(
      screen.getByText(/Turn off Hide checked items to see them again/),
    ).toBeTruthy()
    // The "no ingredients yet" copy would be wrong here — items exist.
    expect(screen.queryByText(/No ingredients for the selected week/)).toBeNull()
  })

  it('remembers the preference for the next visit', () => {
    const first = renderPage([entry({ id: 'butter', name: 'Butter', checked: true })])
    fireEvent.click(screen.getByLabelText('Hide checked items'))
    first.unmount()

    renderPage([entry({ id: 'butter', name: 'Butter', checked: true })])

    expect((screen.getByLabelText('Hide checked items') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByText('Butter')).toBeNull()
  })
})
