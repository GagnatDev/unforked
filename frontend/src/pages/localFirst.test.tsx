import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import {
  __resetLocalDbForTests, getLocalMealPlan, getLocalRecipe, getLocalShoppingList, listOutboxOps,
  putLocalMealPlan, putLocalRecipe, putLocalShoppingList, setSyncMeta,
} from '@/local/db'
import { api } from '@/api'
import { getCurrentWeekId, getNextWeekId } from '@/lib/utils'
import { DAYS } from '@/components/meal-plan/constants'
import { selectOption } from '@/test/selectOption'

const mocks = vi.hoisted(() => ({ pull: vi.fn() }))
vi.mock('@/local/pullDemand', () => ({
  FAMILY_DEFAULT_PERSONS_KEY: 'family-default-persons',
  pullMealPlan: mocks.pull,
  pullRecipes: mocks.pull,
  pullRecipe: mocks.pull,
  pullShoppingList: mocks.pull,
  pullFamilyMealPlanDefaults: mocks.pull,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
// Keep real mutations/outbox writes, but do not start transport draining in page tests.
vi.mock('@/local/outboxSync', () => ({ kickOutboxSync: vi.fn(), scheduleSync: vi.fn() }))

import type { PersistedShoppingListDoc, Recipe } from '@/types'
import RecipeForm from './RecipeForm'

import Today from './Today'
import MealPlan from './MealPlan'
import RecipeList from './RecipeList'
import ShoppingList from './ShoppingList'

function EditRecipe() {
  return <Routes><Route path="/recipes/:id/edit" element={<RecipeForm />} /></Routes>
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  globalThis.indexedDB = new IDBFactory()
  mocks.pull.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const pages = [
  { name: 'RecipeForm', Component: EditRecipe, empty: () => screen.getByText(/isn't available on this device yet/i), path: '/recipes/missing/edit' },
  { name: 'Today', Component: Today, empty: () => screen.getByText(/no meal planned/i) },
  { name: 'MealPlan', Component: MealPlan, empty: () => screen.getAllByRole('combobox', { name: /recipe for monday/i })[0] },
  { name: 'RecipeList', Component: RecipeList, empty: () => screen.getByText(/no recipes/i) },
  { name: 'ShoppingList', Component: ShoppingList, empty: () => screen.getByText(/no ingredients/i) },
]

describe.each(pages)('$name local-first rendering', ({ Component, empty, path = '/' }) => {
  it('renders an empty local store without settling the pull', async () => {
    // Keep the real local read and background hook; only the network is stalled.
    mocks.pull.mockImplementation(() => new Promise<void>(() => {}))
    render(<MemoryRouter initialEntries={[path]}><Component /></MemoryRouter>)
    await waitFor(() => expect(empty()).toBeTruthy())
    expect(screen.queryByText(/loading/i)).toBeNull()
    expect(mocks.pull).toHaveBeenCalled()
    if (path !== '/') {
      expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
      expect(screen.getByRole('link', { name: 'Back to recipes' }).getAttribute('href')).toBe('/recipes')
    }
  })

  it('keeps empty UI available after a pull fails', async () => {
    mocks.pull.mockRejectedValue(new Error('Sync unavailable'))
    render(<MemoryRouter initialEntries={[path]}><Component /></MemoryRouter>)
    await waitFor(() => expect(empty()).toBeTruthy())
    await waitFor(() => expect(screen.getByText('Sync unavailable').getAttribute('role')).toBe('status'))
    expect(screen.queryByText(/loading/i)).toBeNull()
  })
})

const recipe: Recipe = {
  id: 'missing',
  doc: { name: 'Local soup', description: '', servings: 4, ingredients: [], steps: [], tags: [], sourceUrl: null, sourceName: null },
}

describe('recipe form local availability', () => {
  it('allows creating a recipe while offline without pulling', () => {
    mocks.pull.mockImplementation(() => new Promise<void>(() => {}))
    render(<MemoryRouter><RecipeForm /></MemoryRouter>)
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New soup' } })
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('New soup')
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
    expect(mocks.pull).not.toHaveBeenCalled()
  })

  it.each(['hanging', 'failed'])('edits a cached recipe with a %s pull', async (state) => {
    await putLocalRecipe(recipe)
    if (state === 'failed') mocks.pull.mockRejectedValue(new Error('Sync unavailable'))
    else mocks.pull.mockImplementation(() => new Promise<void>(() => {}))
    render(<MemoryRouter initialEntries={['/recipes/missing/edit']}><EditRecipe /></MemoryRouter>)
    const name = await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('Local soup'))
    fireEvent.change(name, { target: { value: 'My soup' } })
    expect(name.value).toBe('My soup')
    if (state === 'failed') expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('opens the editor when reconciliation fills the store, without clobbering later edits', async () => {
    mocks.pull.mockImplementation(() => new Promise<void>(() => {}))
    render(<MemoryRouter initialEntries={['/recipes/missing/edit']}><EditRecipe /></MemoryRouter>)
    await screen.findByText(/isn't available on this device yet/i)
    await act(() => putLocalRecipe(recipe))
    const name = await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('Local soup'))
    fireEvent.change(name, { target: { value: 'My soup' } })
    await act(() => putLocalRecipe({ ...recipe, doc: { ...recipe.doc, name: 'Remote soup' } }))
    expect(name.value).toBe('My soup')
    expect(screen.queryByText(/isn't available on this device yet/i)).toBeNull()
  })
})

function stallPull(state: string) {
  if (state === 'failed') mocks.pull.mockRejectedValue(new Error('Sync unavailable'))
  else mocks.pull.mockImplementation(() => new Promise<void>(() => {}))
}

async function seedToday() {
  const weekId = getCurrentWeekId()
  await putLocalMealPlan(weekId, {
    weekIdentifier: weekId, defaultPersons: 4,
    assignments: DAYS.map((day) => ({ day, recipeId: recipe.id, recipeName: recipe.doc.name })),
  })
}

describe.each(['hanging', 'failed'])('cached pages with a %s pull', (state) => {
  beforeEach(() => stallPull(state))

  it.each(['meal plan', 'recipe'])('keeps today’s cached meal visible while the %s pull is unavailable', async (stage) => {
    if (stage === 'recipe') mocks.pull.mockResolvedValueOnce(undefined)
    await seedToday()
    await putLocalRecipe(recipe)
    render(<MemoryRouter><Today /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Local soup' })).toBeTruthy()
    expect(screen.queryByText(/no meal planned/i)).toBeNull()
    await waitFor(() => expect(mocks.pull).toHaveBeenCalledTimes(stage === 'recipe' ? 2 : 1))
    if (state === 'failed') await screen.findByText('Sync unavailable')
  })

  it('preserves a known assignment when its recipe is unavailable locally', async () => {
    await seedToday()
    render(<MemoryRouter><Today /></MemoryRouter>)
    await screen.findByText(/isn't available on this device yet/i)
    expect(screen.getByRole('heading', { name: 'Local soup' })).toBeTruthy()
    expect(screen.queryByText(/no meal planned/i)).toBeNull()
    expect(screen.getByRole('link', { name: /go to weekly menu/i }).getAttribute('href')).toBe('/meal-plan')
    if (state === 'failed') await screen.findByText('Sync unavailable')
    await act(() => putLocalRecipe(recipe))
    await waitFor(() => expect(screen.queryByText(/isn't available on this device yet/i)).toBeNull())
    expect(screen.getByRole('heading', { name: 'Local soup' })).toBeTruthy()
  })

  it('shows and searches cached recipes, then observes later local reconciliation', async () => {
    await putLocalRecipe(recipe)
    render(<MemoryRouter><RecipeList /></MemoryRouter>)
    await screen.findByRole('link', { name: 'Local soup' })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'soup' } })
    if (state === 'failed') await screen.findByText('Sync unavailable')
    await act(() => putLocalRecipe({ ...recipe, id: 'remote', doc: { ...recipe.doc, name: 'Remote soup' } }))
    await screen.findByRole('link', { name: 'Remote soup' })
    expect(screen.getByRole('link', { name: 'Local soup' })).toBeTruthy()
    const deleteButton = screen.getByRole('button', { name: 'Delete Local soup' })
    fireEvent.focus(deleteButton)
    fireEvent.click(deleteButton)
    await waitFor(async () => {
      expect(await getLocalRecipe(recipe.id)).toBeNull()
      expect(await listOutboxOps()).toEqual([expect.objectContaining({ entity: 'recipe', key: recipe.id, type: 'delete' })])
    })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Local soup' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Remote soup' })).toBeTruthy()
  })

  it.each([false, true])('persists an assignment and outbox with existing plan=%s', async (existing) => {
    const weekId = getNextWeekId()
    await putLocalRecipe(recipe)
    await setSyncMeta('family-default-persons', 3)
    if (existing) await putLocalMealPlan(weekId, { weekIdentifier: weekId, defaultPersons: 3, assignments: [] })
    render(<MemoryRouter><MealPlan /></MemoryRouter>)
    const controls = await screen.findAllByRole('combobox', { name: /recipe for monday/i })
    await selectOption(controls[0], 'Local soup')
    await waitFor(async () => {
      expect(await getLocalMealPlan(weekId)).toMatchObject({
        defaultPersons: 3, assignments: [expect.objectContaining({ day: 'monday', recipeId: recipe.id })],
      })
      expect(await listOutboxOps()).toEqual([expect.objectContaining({ entity: 'mealPlan', key: weekId, type: 'update' })])
    })
    if (state === 'failed') await screen.findByText('Sync unavailable')
  })

  it('keeps cached shopping items visible and queues checking an item', async () => {
    const weekId = getNextWeekId()
    await putLocalShoppingList(weekId, {
      weekIdentifier: weekId,
      items: [{ id: 'milk', name: 'Milk', quantity: '1', unit: 'l', category: 'dairy', checked: false, manual: true, recipeIds: [] }],
    })
    render(<MemoryRouter initialEntries={[`/shopping-list?week=${weekId}`]}><ShoppingList /></MemoryRouter>)
    const checkbox = await screen.findByRole('checkbox', { name: /milk/i })
    fireEvent.click(checkbox)
    await waitFor(async () => {
      expect((await getLocalShoppingList(weekId))?.items[0].checked).toBe(true)
      expect(await listOutboxOps()).toEqual([expect.objectContaining({ entity: 'shoppingItem', key: 'milk', payload: { weekId, patch: { checked: true } } })])
    })
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true))
    if (state === 'failed') await screen.findByText('Sync unavailable')
  })
})

it('reconciles a late shopping pull while retaining a queued check', async () => {
  const weekId = getNextWeekId()
  const initial: PersistedShoppingListDoc = {
    weekIdentifier: weekId,
    items: [{ id: 'milk', name: 'Milk', quantity: '1', unit: 'l', category: 'dairy', checked: false, manual: true, recipeIds: [] }],
  }
  await putLocalShoppingList(weekId, initial)
  let finish!: (doc: PersistedShoppingListDoc) => void
  vi.spyOn(api.shoppingList, 'get').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const realSync = await vi.importActual<typeof import('@/local/sync')>('@/local/sync')
  let initialPull!: Promise<void>
  mocks.pull.mockImplementation((week: string) => (initialPull = realSync.pullShoppingList(week)))
  render(<MemoryRouter initialEntries={[`/shopping-list?week=${weekId}`]}><ShoppingList /></MemoryRouter>)
  const checkbox = await screen.findByRole('checkbox', { name: /milk/i })
  fireEvent.click(checkbox)
  await waitFor(async () => expect(await listOutboxOps()).toHaveLength(1))
  const fresh = { ...initial, items: [...initial.items, { ...initial.items[0], id: 'bread', name: 'Bread' }] }
  await act(async () => { finish(fresh); await initialPull })
  // The request-relative guard retains the week changed during GET; the
  // engine's trailing fresh pull then merges remote fields with queued intent.
  vi.mocked(api.shoppingList.get).mockResolvedValue(fresh)
  await act(async () => realSync.pullShoppingList(weekId))
  await screen.findByRole('checkbox', { name: /bread/i })
  expect((screen.getByRole('checkbox', { name: /milk/i }) as HTMLInputElement).checked).toBe(true)
  expect((await getLocalShoppingList(weekId))?.items.find((item) => item.id === 'milk')?.checked).toBe(true)
  expect(await listOutboxOps()).toHaveLength(1)
})

it('reconciles a late meal-plan pull without replacing the queued local edit', async () => {
  const weekId = getNextWeekId()
  const initial = { weekIdentifier: weekId, defaultPersons: 4, assignments: [] }
  await putLocalMealPlan(weekId, initial)
  await putLocalRecipe(recipe)
  let finish!: (doc: typeof initial) => void
  vi.spyOn(api.mealPlans, 'getCurrent').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const realSync = await vi.importActual<typeof import('@/local/sync')>('@/local/sync')
  let initialPull!: Promise<void>
  mocks.pull.mockImplementation((week?: string) => week === weekId ? (initialPull = realSync.pullMealPlan(week)) : Promise.resolve())
  render(<MemoryRouter><MealPlan /></MemoryRouter>)
  const controls = await screen.findAllByRole('combobox', { name: /recipe for monday/i })
  await selectOption(controls[0], 'Local soup')
  await waitFor(async () => expect(await listOutboxOps()).toHaveLength(1))
  await act(async () => { finish({ ...initial, defaultPersons: 6 }); await initialPull })
  vi.mocked(api.mealPlans.getCurrent).mockResolvedValue({ ...initial, defaultPersons: 6 })
  await act(async () => realSync.pullMealPlan(weekId))
  await waitFor(async () => expect(await getLocalMealPlan(weekId)).toMatchObject({ defaultPersons: 6 }))
  await waitFor(() => expect(controls[0].textContent).toContain('Local soup'))
  expect((await getLocalMealPlan(weekId))?.assignments[0].recipeId).toBe(recipe.id)
  expect(await listOutboxOps()).toHaveLength(1)
})
