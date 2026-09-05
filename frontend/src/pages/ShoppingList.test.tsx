import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { ShoppingListEntry, ShoppingTrip } from '@/types'

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

const actions = {
  toggleChecked: vi.fn(),
  changeCategory: vi.fn(),
  editItem: vi.fn(),
  addItem: vi.fn(),
  deleteItem: vi.fn(),
  approve: vi.fn(),
  markReady: vi.fn(),
  reopen: vi.fn(),
  completeTrip: vi.fn(),
  undoTrip: vi.fn(),
}

function renderPage(
  items: ShoppingListEntry[],
  resolving = false,
  trip: Partial<{
    status: string
    approvedByEmail: string | null
    approvedAt: string | null
    readyByEmail: string | null
    readyAt: string | null
    trips: ShoppingTrip[]
  }> = {},
) {
  mocks.useShoppingWeek.mockReturnValue({ weekId: '2026-W28', resolving })
  mocks.useShoppingList.mockReturnValue({
    items,
    trips: [],
    loading: false,
    error: null,
    adding: false,
    status: 'open',
    approvedByEmail: null,
    approvedAt: null,
    readyByEmail: null,
    readyAt: null,
    ...trip,
    ...actions,
  })
  return render(
    <MemoryRouter>
      <ShoppingList />
    </MemoryRouter>,
  )
}

function completedTrip(overrides: Partial<ShoppingTrip> = {}): ShoppingTrip {
  return {
    id: 'trip-1',
    completedAt: '2026-07-06T15:04:00.000Z',
    completedBy: 'user-2',
    completedByEmail: 'bo@example.com',
    items: [
      entry({ id: 'onion', name: 'Onion', quantity: '2', unit: '', checked: true }),
      entry({ id: 'beef', name: 'Minced beef', quantity: '500', unit: 'g', checked: true }),
    ],
    ...overrides,
  }
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

  it('offers "Ready to shop" while nothing is in the cart yet', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })])

    fireEvent.click(screen.getByRole('button', { name: 'Ready to shop' }))
    expect(actions.markReady).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Shopping done' })).toBeNull()
  })

  it('offers "Shopping done" without a claim once ticking has started (the quick top-up run)', () => {
    renderPage([
      entry({ id: 'milk', name: 'Milk' }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Shopping done' }))
    expect(actions.completeTrip).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Ready to shop' })).toBeNull()
    expect(screen.getByRole('button', { name: "I'm going shopping" })).toBeTruthy()
  })

  it('names who declared the list ready and lets anyone take it back', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })], false, {
      status: 'ready',
      readyByEmail: 'ann@example.com',
      readyAt: '2026-08-29T17:12:00.000Z',
    })

    expect(screen.getByRole('status').textContent).toMatch(
      /Ready to shop — ann@example\.com finished the list/,
    )
    expect(screen.getByRole('button', { name: "I'm going shopping" })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }))
    expect(actions.reopen).toHaveBeenCalledTimes(1)
  })

  it('names who is shopping and offers to finish or cancel the trip', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })], false, {
      status: 'approved',
      approvedByEmail: 'ann@example.com',
      approvedAt: '2026-08-29T17:12:00.000Z',
    })

    expect(screen.getByText(/ann@example\.com is shopping/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: "I'm going shopping" })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Shopping done' }))
    expect(actions.completeTrip).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel trip' }))
    expect(actions.reopen).toHaveBeenCalledTimes(1)
  })
})

describe('ShoppingList completed trips', () => {
  it('lists the week\'s trips newest first with their items, and can put one back', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })], false, {
      trips: [
        completedTrip(),
        completedTrip({
          id: 'trip-2',
          completedAt: '2026-07-08T09:30:00.000Z',
          items: [entry({ id: 'bread', name: 'Bread', quantity: '1', unit: '', checked: true })],
        }),
      ],
    })

    expect(screen.getByText('1 to buy · 3 bought this week')).toBeTruthy()
    const history = within(screen.getByRole('region', { name: 'Bought this week' }))
    const rows = history.getAllByText(/^Trip \d$/).map((el) => el.textContent)
    expect(rows).toEqual(['Trip 2', 'Trip 1'])
    expect(history.getByText('Minced beef')).toBeTruthy()
    expect(history.getAllByText('bo@example.com', { exact: false })).toHaveLength(2)

    fireEvent.click(history.getByRole('button', { name: 'Put the items from trip 1 back on the list' }))
    expect(actions.undoTrip).toHaveBeenCalledWith('trip-1')
  })

  it('tells the difference between nothing planned and everything bought', () => {
    const { unmount } = renderPage([])
    expect(screen.getByText(/No ingredients for the selected week/)).toBeTruthy()
    unmount()

    renderPage([], false, { trips: [completedTrip()] })
    expect(screen.getByText(/Everything on the list has been bought/)).toBeTruthy()
    expect(screen.queryByText(/No ingredients for the selected week/)).toBeNull()
    expect(screen.getByText('2 bought this week')).toBeTruthy()
    // No open items, so no green status card — the history is the record.
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('region', { name: 'Bought this week' })).toBeTruthy()
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
