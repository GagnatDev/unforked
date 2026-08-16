import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DayAssignment, Recipe } from '@/types'
import '@/i18n'
import { openOptions, selectOption } from '@/test/selectOption'
import { MealPlanWeekAssignments } from './MealPlanWeekAssignments'

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

const byDay: Record<string, DayAssignment | undefined> = {
  monday: { day: 'monday', recipeId: 'recipe-1', recipeName: 'Spaghetti' },
  tuesday: { day: 'tuesday', recipeId: 'recipe-2', recipeName: 'Tacos', persons: 2 },
}

function renderAssignments(onSwapDays = vi.fn(), setDayPeople = vi.fn()) {
  render(
    <MealPlanWeekAssignments
      byDay={byDay}
      recipes={recipes}
      defaultPersons={4}
      setAssignment={vi.fn()}
      setDayPeople={setDayPeople}
      onSwapDays={onSwapDays}
    />,
  )
  return onSwapDays
}

/** Both layouts (mobile list, desktop table) render; either control works. */
function peopleTrigger(day: string) {
  return screen.getAllByRole('combobox', {
    name: new RegExp(`People for ${day}`, 'i'),
  })[0]
}

describe('MealPlanWeekAssignments swap', () => {
  afterEach(() => cleanup())

  it('swaps two days by tapping their handles', () => {
    const onSwapDays = renderAssignments()

    // Both the mobile and desktop layouts are in the DOM; either handle works.
    fireEvent.click(screen.getAllByRole('button', { name: /Swap Monday/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /Swap with Tuesday/i })[0])

    expect(onSwapDays).toHaveBeenCalledWith('monday', 'tuesday')
  })

  it('tapping the armed day again cancels instead of swapping', () => {
    const onSwapDays = renderAssignments()

    const mondayHandle = screen.getAllByRole('button', { name: /Swap Monday/i })[0]
    fireEvent.click(mondayHandle)
    fireEvent.click(mondayHandle)

    expect(onSwapDays).not.toHaveBeenCalled()
    // Back to idle: no day is armed anymore.
    expect(screen.queryAllByRole('button', { name: /Swap with/i })).toHaveLength(0)
  })

  it('disables handles for days without a recipe until a swap is armed', () => {
    renderAssignments()

    const sundayHandle = screen.getAllByRole('button', {
      name: /Swap Sunday/i,
    })[0] as HTMLButtonElement
    expect(sundayHandle.disabled).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: /Swap Monday/i })[0])
    const sundayTarget = screen.getAllByRole('button', {
      name: /Swap with Sunday/i,
    })[0] as HTMLButtonElement
    expect(sundayTarget.disabled).toBe(false)
  })
})

describe('MealPlanWeekAssignments people', () => {
  afterEach(() => cleanup())

  it('reports the head count picked for a day as a number', async () => {
    const setDayPeople = vi.fn()
    renderAssignments(vi.fn(), setDayPeople)

    await selectOption(peopleTrigger('Tuesday'), '6')

    expect(setDayPeople).toHaveBeenCalledWith('tuesday', 6)
  })

  it('names the week default on the entry that clears a day override', async () => {
    renderAssignments()

    // Falling back to the week default (4 here) is what an empty day means.
    expect(await openOptions(peopleTrigger('Tuesday'))).toContain('Default (4)')
  })

  it('shows the day override in the trigger, not the week default', () => {
    renderAssignments()

    expect(peopleTrigger('Tuesday').textContent).toContain('2')
    expect(peopleTrigger('Monday').textContent).toContain('Default (4)')
  })

  it('disables the picker for a day with no recipe', () => {
    renderAssignments()

    expect((peopleTrigger('Sunday') as HTMLButtonElement).disabled).toBe(true)
  })
})
