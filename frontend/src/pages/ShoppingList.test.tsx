import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { ShoppingListEntry } from '@/types'

const mocks = vi.hoisted(() => ({ useShoppingList: vi.fn(), useShoppingWeek: vi.fn() }))

vi.mock('./shopping-list/useShoppingList', () => ({
  useShoppingList: mocks.useShoppingList,
}))

// Which week the page lands on is the week hook's job (and its own test);
// here it is fed in so the rows under test don't depend on the local store.
vi.mock('./shopping-list/useShoppingWeek', () => ({
  useShoppingWeek: mocks.useShoppingWeek,
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

function renderPage(
  items: ShoppingListEntry[],
  resolving = false,
  trip: Partial<{
    status: string
    approvedByEmail: string | null
    approvedAt: string | null
  }> = {},
) {
  mocks.useShoppingWeek.mockReturnValue({ weekId: '2026-W28', resolving })
  mocks.useShoppingList.mockReturnValue({
    items,
    loading: false,
    error: null,
    adding: false,
    status: 'draft',
    approvedByEmail: null,
    approvedAt: null,
    ...trip,
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

describe('ShoppingList week', () => {
  it('reads the list of the week the week hook settles on', () => {
    renderPage([entry({})])

    expect(mocks.useShoppingList).toHaveBeenCalledWith('2026-W28')
  })

  it('waits rather than flashing an empty list while the week is undecided', () => {
    renderPage([], true)

    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText(/No ingredients for the selected week/)).toBeNull()
  })
})

describe('ShoppingList trip status', () => {
  it('counts the whole list and offers the trip while nobody is shopping', () => {
    renderPage([
      entry({ id: 'milk', name: 'Milk' }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ])

    const progress = screen.getByRole('progressbar', { name: 'In the cart' })
    expect(progress.getAttribute('aria-valuenow')).toBe('1')
    expect(progress.getAttribute('aria-valuemax')).toBe('2')
    expect(screen.getByRole('button', { name: "I'm going shopping" })).toBeTruthy()
  })

  it('names who is shopping and offers to close the trip', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })], false, {
      status: 'approved',
      approvedByEmail: 'ann@example.com',
      approvedAt: '2026-08-29T17:12:00.000Z',
    })

    expect(screen.getByText(/ann@example\.com is shopping/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: "I'm going shopping" })).toBeNull()
  })
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
    // Scoped to the section: the status card shows the same 1/2 for the list
    // as a whole, and neither counter may shrink as rows are hidden.
    const dairy = within(screen.getByRole('region', { name: 'Dairy & eggs' }))
    expect(dairy.getByText('1/2')).toBeTruthy()
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
