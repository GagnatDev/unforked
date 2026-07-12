import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DayAssignment, Recipe } from '@/types'
import '@/i18n'
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

function renderAssignments(onSwapDays = vi.fn()) {
  render(
    <MealPlanWeekAssignments
      byDay={byDay}
      recipes={recipes}
      defaultPersons={4}
      setAssignment={vi.fn()}
      setDayPeople={vi.fn()}
      onSwapDays={onSwapDays}
    />,
  )
  return onSwapDays
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
