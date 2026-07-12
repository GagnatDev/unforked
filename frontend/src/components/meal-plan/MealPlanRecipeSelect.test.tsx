import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DayAssignment, Recipe } from '@/types'
import '@/i18n'
import { MealPlanRecipeSelect } from './MealPlanRecipeSelect'

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

const recipes = [
  recipe('recipe-abc123', 'Spaghetti Bolognese'),
  recipe('recipe-def456', 'Tomato Soup'),
]

describe('MealPlanRecipeSelect', () => {
  afterEach(() => cleanup())

  it('shows the selected recipe name in the trigger, not its id', () => {
    const byDay: Record<string, DayAssignment | undefined> = {
      monday: { day: 'monday', recipeId: 'recipe-abc123', recipeName: 'Spaghetti Bolognese' },
    }

    render(
      <MealPlanRecipeSelect
        day="monday"
        byDay={byDay}
        recipes={recipes}
        setAssignment={vi.fn()}
        className=""
        idSuffix="desktop"
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toContain('Spaghetti Bolognese')
    expect(trigger.textContent).not.toContain('recipe-abc123')
  })

  it('shows the placeholder when no recipe is selected', () => {
    const byDay: Record<string, DayAssignment | undefined> = {}

    render(
      <MealPlanRecipeSelect
        day="monday"
        byDay={byDay}
        recipes={recipes}
        setAssignment={vi.fn()}
        className=""
        idSuffix="desktop"
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).not.toContain('recipe-abc123')
  })
})
