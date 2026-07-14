import { describe, expect, it } from 'vitest'

import type { DayAssignment, MealPlanDoc } from '@/types'
import { mergeMealPlan } from './mealPlanMerge'

const week = '2026-W28'

function plan(assignments: DayAssignment[], defaultPersons?: number | null): MealPlanDoc {
  return { weekIdentifier: week, defaultPersons: defaultPersons ?? null, assignments }
}

function meal(day: string, recipeId: string, persons?: number | null): DayAssignment {
  return { day, recipeId, recipeName: recipeId.toUpperCase(), persons: persons ?? null }
}

function days(doc: MealPlanDoc): Record<string, string> {
  return Object.fromEntries(doc.assignments.map((a) => [a.day, a.recipeId]))
}

describe('mergeMealPlan', () => {
  it("keeps another device's different-day edit while applying ours", () => {
    const base = plan([meal('monday', 'a')])
    // We added Tuesday offline.
    const ours = plan([meal('monday', 'a'), meal('tuesday', 'b')])
    // The server meanwhile got a Thursday from another device.
    const server = plan([meal('monday', 'a'), meal('thursday', 'c')])

    const merged = mergeMealPlan(base, ours, server, week)

    expect(days(merged)).toEqual({ monday: 'a', tuesday: 'b', thursday: 'c' })
  })

  it('our change to a day wins over the server for that same day', () => {
    const base = plan([meal('monday', 'a')])
    const ours = plan([meal('monday', 'x')])
    const server = plan([meal('monday', 'y'), meal('friday', 'f')])

    const merged = mergeMealPlan(base, ours, server, week)

    expect(days(merged)).toEqual({ monday: 'x', friday: 'f' })
  })

  it('propagates our removal of a day without dropping untouched server days', () => {
    const base = plan([meal('monday', 'a'), meal('tuesday', 'b')])
    // We cleared Tuesday offline.
    const ours = plan([meal('monday', 'a')])
    // Server added Wednesday, kept Tuesday.
    const server = plan([meal('monday', 'a'), meal('tuesday', 'b'), meal('wednesday', 'c')])

    const merged = mergeMealPlan(base, ours, server, week)

    expect(days(merged)).toEqual({ monday: 'a', wednesday: 'c' })
  })

  it('does not touch a server day we never changed', () => {
    const base = plan([meal('monday', 'a')])
    const ours = plan([meal('monday', 'a')]) // no change at all
    const server = plan([meal('monday', 'z')]) // server changed monday

    const merged = mergeMealPlan(base, ours, server, week)

    expect(days(merged)).toEqual({ monday: 'z' })
  })

  it('applies our per-day people override for a changed day', () => {
    const base = plan([meal('monday', 'a', 2)])
    const ours = plan([meal('monday', 'a', 5)])
    const server = plan([meal('monday', 'a', 2)])

    const merged = mergeMealPlan(base, ours, server, week)

    expect(merged.assignments[0].persons).toBe(5)
  })

  it('merges defaultPersons only when we changed it', () => {
    const changedByUs = mergeMealPlan(plan([], 2), plan([], 4), plan([], 3), week)
    expect(changedByUs.defaultPersons).toBe(4)

    const unchangedByUs = mergeMealPlan(plan([], 2), plan([], 2), plan([], 3), week)
    expect(unchangedByUs.defaultPersons).toBe(3)
  })
})
