import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { MealPlanDoc, Recipe } from '@/types'
import { getNextWeekId } from '@/lib/utils'
import { selectOption } from '@/test/selectOption'
import { waitFor } from '@/test/waitFor'

const mocks = vi.hoisted(() => ({
  useLocal: vi.fn(),
  saveMealPlan: vi.fn(),
}))

vi.mock('@/local/useLocal', () => ({ useLocal: mocks.useLocal }))
vi.mock('@/local/useBackgroundPull', () => ({
  useBackgroundPull: () => ({ pulling: false, error: null }),
}))
vi.mock('@/local/mutations', () => ({ saveMealPlan: mocks.saveMealPlan }))
// The week picker is exercised elsewhere; this file is about persisting edits.
vi.mock('@/components/WeekPicker', () => ({ WeekPicker: () => null }))

import MealPlan from './MealPlan'

function recipe(id: string, name: string): Recipe {
  return {
    id,
    doc: {
      name,
      description: '',
      sourceUrl: null,
      sourceName: null,
      ingredients: [],
      steps: [],
      servings: 2,
      tags: [],
    },
  }
}

const recipes = [recipe('recipe-1', 'Spaghetti'), recipe('recipe-2', 'Tacos')]

/** The page opens on next week, so that is the plan it loads and saves. */
const weekId = getNextWeekId()

function renderPage() {
  mocks.useLocal.mockReturnValue({
    loading: false,
    data: {
      recipes,
      plan: {
        weekIdentifier: weekId,
        defaultPersons: 4,
        assignments: [
          { day: 'monday', recipeId: 'recipe-1', recipeName: 'Spaghetti' },
          { day: 'tuesday', recipeId: 'recipe-2', recipeName: 'Tacos', persons: 2 },
        ],
      },
    },
  })
  return render(<MealPlan />)
}

/** Both layouts render; either control drives the same handler. */
function combobox(name: RegExp) {
  return screen.getAllByRole('combobox', { name })[0]
}

/** The most recent doc handed to `saveMealPlan`. */
function lastSavedDoc(): MealPlanDoc {
  const calls = mocks.saveMealPlan.mock.calls
  return calls[calls.length - 1][1] as MealPlanDoc
}

beforeEach(() => {
  mocks.saveMealPlan.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MealPlan autosave', () => {
  it('has no save button — edits persist on their own', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(mocks.saveMealPlan).not.toHaveBeenCalled()
  })

  it('saves the plan when a day gets a different recipe', async () => {
    renderPage()

    await selectOption(combobox(/Recipe for Monday/i), 'Tacos')

    expect(mocks.saveMealPlan).toHaveBeenCalledTimes(1)
    expect(mocks.saveMealPlan.mock.calls[0][0]).toBe(weekId)
    expect(lastSavedDoc().assignments).toContainEqual(
      expect.objectContaining({ day: 'monday', recipeId: 'recipe-2' }),
    )
  })

  it('saves the plan when a day is cleared', async () => {
    renderPage()

    await selectOption(combobox(/Recipe for Monday/i), '—')

    expect(mocks.saveMealPlan).toHaveBeenCalledTimes(1)
    expect(lastSavedDoc().assignments.map((a) => a.day)).toEqual(['tuesday'])
  })

  it('saves the plan when a day override changes', async () => {
    renderPage()

    await selectOption(combobox(/People for Tuesday/i), '6')

    expect(mocks.saveMealPlan).toHaveBeenCalledTimes(1)
    expect(lastSavedDoc().assignments).toContainEqual(
      expect.objectContaining({ day: 'tuesday', persons: 6 }),
    )
  })

  it('saves the plan when the week default changes', async () => {
    renderPage()

    await selectOption(combobox(/People \(default for the week\)/i), '3')

    expect(mocks.saveMealPlan).toHaveBeenCalledTimes(1)
    expect(lastSavedDoc().defaultPersons).toBe(3)
  })

  it('saves the plan when two days swap dinners', () => {
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: /Swap Monday/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /Swap with Tuesday/i })[0])

    expect(mocks.saveMealPlan).toHaveBeenCalledTimes(1)
    const byDay = Object.fromEntries(
      lastSavedDoc().assignments.map((a) => [a.day, a.recipeId]),
    )
    expect(byDay).toEqual({ monday: 'recipe-2', tuesday: 'recipe-1' })
  })

  it('reports the save once it lands', async () => {
    renderPage()

    await selectOption(combobox(/People for Tuesday/i), '6')

    await waitFor(() => screen.getByRole('status').textContent === 'Saved')
  })

  it('reports a failed save instead of claiming it was saved', async () => {
    mocks.saveMealPlan.mockRejectedValue(new Error('quota exceeded'))
    renderPage()

    await selectOption(combobox(/People for Tuesday/i), '6')

    await waitFor(() =>
      (screen.getByRole('status').textContent ?? '').includes('quota exceeded'),
    )
  })

  it('lets the newest save decide the outcome when an earlier one is slower', async () => {
    let failFirst: (e: Error) => void = () => {}
    mocks.saveMealPlan.mockImplementationOnce(
      () => new Promise((_, reject) => (failFirst = reject)),
    )
    renderPage()

    await selectOption(combobox(/People for Tuesday/i), '6')
    await selectOption(combobox(/People for Tuesday/i), '5')
    // The first save only fails after the second one has already succeeded.
    failFirst(new Error('stale failure'))

    await waitFor(() => screen.getByRole('status').textContent === 'Saved')
    expect(lastSavedDoc().assignments).toContainEqual(
      expect.objectContaining({ day: 'tuesday', persons: 5 }),
    )
  })
})
