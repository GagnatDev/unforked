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
  setTripCost: vi.fn(),
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

  it('offers "Shopping done" without a claim once ticking has started (the quick top-up run)', async () => {
    renderPage([
      entry({ id: 'milk', name: 'Milk' }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Shopping done' }))
    // With something in the cart the receipt question comes first.
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/1 item moves to Bought this week/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip' }))
    expect(actions.completeTrip).toHaveBeenCalledTimes(1)
    expect(actions.completeTrip).toHaveBeenCalledWith()
    expect(screen.queryByRole('button', { name: 'Ready to shop' })).toBeNull()
    expect(screen.getByRole('button', { name: "I'm going shopping" })).toBeTruthy()
  })

  it('records what the trip cost when "Finish trip" is pressed with an amount', async () => {
    renderPage([
      entry({ id: 'milk', name: 'Milk', checked: true }),
      entry({ id: 'butter', name: 'Butter', checked: true }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Shopping done' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/2 items move to Bought this week/)
    const field = within(dialog).getByLabelText('Total paid')

    fireEvent.change(field, { target: { value: 'abc' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish trip' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/Enter an amount in kroner/)
    expect(actions.completeTrip).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: '1 249,50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish trip' }))
    expect(actions.completeTrip).toHaveBeenCalledWith(1249.5)
  })

  it('completes straight away when nothing is checked — there is no trip to price', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })], false, {
      status: 'approved',
      approvedByEmail: 'ann@example.com',
      approvedAt: '2026-08-29T17:12:00.000Z',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Shopping done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.completeTrip).toHaveBeenCalledTimes(1)
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
    expect(screen.getByRole('button', { name: 'Shopping done' })).toBeTruthy()
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

  it('dates each trip under its heading and adds up what the week cost', () => {
    renderPage([entry({ id: 'milk', name: 'Milk' })], false, {
      trips: [
        completedTrip({ totalCost: 349.5 }),
        completedTrip({
          id: 'trip-2',
          completedAt: '2026-07-08T09:30:00.000Z',
          items: [entry({ id: 'bread', name: 'Bread', checked: true })],
          totalCost: 900,
        }),
      ],
    })

    const history = within(screen.getByRole('region', { name: 'Bought this week' }))
    const dates = history.getAllByRole('time').map((el) => el.getAttribute('datetime'))
    expect(dates).toEqual(['2026-07-08T09:30:00.000Z', '2026-07-06T15:04:00.000Z'])
    // The day is spelled out — a record is read back later, not at 14:32 today.
    expect(history.getAllByRole('time')[1].textContent).toMatch(/Mon, Jul 6/)
    // On the row and again on the "Total paid" line inside it.
    expect(history.getAllByText('349.5 kr')).toHaveLength(2)
    expect(history.getAllByText('900 kr')).toHaveLength(2)
    expect(history.getByText('3 items · 1,249.5 kr')).toBeTruthy()
    expect(screen.getByText('1 to buy · 3 bought this week · 1,249.5 kr spent')).toBeTruthy()
  })

  it('lets the amount be added to a trip that was finished without one', () => {
    renderPage([], false, { trips: [completedTrip()] })

    const history = within(screen.getByRole('region', { name: 'Bought this week' }))
    expect(history.getByText('Amount not recorded')).toBeTruthy()
    expect(screen.queryByText(/spent/)).toBeNull()

    fireEvent.click(history.getByRole('button', { name: 'Add what trip 1 cost' }))
    fireEvent.change(history.getByLabelText('Total paid'), { target: { value: '620' } })
    fireEvent.click(history.getByRole('button', { name: 'Save' }))
    expect(actions.setTripCost).toHaveBeenCalledWith('trip-1', 620)
  })

  it('lets a recorded amount be corrected or cleared', () => {
    renderPage([], false, { trips: [completedTrip({ totalCost: 620 })] })

    const history = within(screen.getByRole('region', { name: 'Bought this week' }))
    fireEvent.click(history.getByRole('button', { name: 'Edit what trip 1 cost' }))
    const field = history.getByLabelText('Total paid') as HTMLInputElement
    expect(field.value).toBe('620')

    fireEvent.change(field, { target: { value: '650,50' } })
    fireEvent.click(history.getByRole('button', { name: 'Save' }))
    expect(actions.setTripCost).toHaveBeenCalledWith('trip-1', 650.5)

    fireEvent.click(history.getByRole('button', { name: 'Edit what trip 1 cost' }))
    fireEvent.change(history.getByLabelText('Total paid'), { target: { value: '' } })
    fireEvent.click(history.getByRole('button', { name: 'Save' }))
    expect(actions.setTripCost).toHaveBeenLastCalledWith('trip-1', null)
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
