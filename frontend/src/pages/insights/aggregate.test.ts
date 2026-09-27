import { describe, expect, it } from 'vitest'

import type { InsightsWeek } from '@/types'
import {
  buildPeriods,
  dayDate,
  fetchRange,
  hasAnyRecord,
  periodKey,
  periodStarts,
  summarize,
} from './aggregate'

// A Saturday late in September 2026 (ISO week 39).
const now = new Date(2026, 8, 26, 16, 0)

const weeks: InsightsWeek[] = [
  {
    weekId: '2026-W36',
    meals: [
      { day: 'monday', recipeId: 'r1', recipeName: 'Tacos' },
      { day: 'thursday', recipeId: 'r2', recipeName: 'Soup', persons: 2 },
    ],
    trips: [
      // Paid on the Sunday before the week it fed: August 30th.
      { id: 't1', completedAt: '2026-08-30T15:00:00', completedByEmail: 'ann@example.com', itemCount: 12, totalCost: 1249.5 },
    ],
  },
  {
    weekId: '2026-W39',
    meals: [{ day: 'sunday', recipeId: 'r1', recipeName: 'Tacos' }],
    trips: [
      { id: 't2', completedAt: '2026-09-22T17:30:00', completedByEmail: 'bo@example.com', itemCount: 4 },
      { id: 't3', completedAt: '2026-09-25T12:00:00', completedByEmail: 'ann@example.com', itemCount: 8, totalCost: 620 },
    ],
  },
  {
    // Outside the 12-month window entirely.
    weekId: '2024-W02',
    meals: [{ day: 'monday', recipeId: 'r1', recipeName: 'Old' }],
    trips: [{ id: 'old', completedAt: '2024-01-08T12:00:00', completedByEmail: 'x', itemCount: 1, totalCost: 99 }],
  },
]

describe('dayDate', () => {
  it('places a planned dinner on its calendar day', () => {
    expect(dayDate('2026-W36', 'monday')).toEqual(new Date(2026, 7, 31))
    expect(dayDate('2026-W36', 'sunday')).toEqual(new Date(2026, 8, 6))
    expect(dayDate('2026-W36', 'someday')).toEqual(new Date(2026, 7, 31))
    expect(dayDate('nope', 'monday')).toBeNull()
  })
})

describe('periodStarts / periodKey / fetchRange', () => {
  it('spans the twelve periods ending now, oldest first', () => {
    const weekStarts = periodStarts(now, 'week')
    expect(weekStarts).toHaveLength(12)
    expect(weekStarts[0]).toEqual(new Date(2026, 6, 6)) // Monday of W28
    expect(weekStarts[11]).toEqual(new Date(2026, 8, 21)) // Monday of W39

    const monthStarts = periodStarts(now, 'month')
    expect(monthStarts[0]).toEqual(new Date(2025, 9, 1))
    expect(monthStarts[11]).toEqual(new Date(2026, 8, 1))
  })

  it('keys weeks as ISO week ids and months as yyyy-MM', () => {
    expect(periodKey(now, 'week')).toBe('2026-W39')
    expect(periodKey(now, 'month')).toBe('2026-09')
  })

  it('fetches from the first month shown to one week past now', () => {
    expect(fetchRange(now)).toEqual({ from: '2025-W40', to: '2026-W40' })
  })
})

describe('buildPeriods', () => {
  it('groups trips by the week they were paid in, meals by their day, newest first', () => {
    const periods = buildPeriods(weeks, 'week', now)
    expect(periods).toHaveLength(12)
    expect(periods[0].key).toBe('2026-W39')
    expect(periods[11].key).toBe('2026-W28')

    const w39 = periods[0]
    expect(w39.trips.map((t) => t.id)).toEqual(['t3', 't2'])
    expect(w39.spent).toBe(620)
    expect(w39.unpricedTrips).toBe(1)
    expect(w39.meals.map((m) => m.recipeName)).toEqual(['Tacos'])
    expect(w39.end).toEqual(new Date(2026, 8, 27))

    // The Sunday trip for W36 was paid in W35; W36 keeps only its dinners.
    const w35 = periods.find((p) => p.key === '2026-W35')!
    expect(w35.trips.map((t) => t.id)).toEqual(['t1'])
    expect(w35.trips[0].weekId).toBe('2026-W36')
    expect(w35.meals).toEqual([])
    const w36 = periods.find((p) => p.key === '2026-W36')!
    expect(w36.trips).toEqual([])
    expect(w36.meals.map((m) => m.day)).toEqual(['monday', 'thursday'])
  })

  it('groups by calendar month and drops anything outside the window', () => {
    const periods = buildPeriods(weeks, 'month', now)
    expect(periods).toHaveLength(12)
    expect(periods.map((p) => p.key).slice(0, 3)).toEqual(['2026-09', '2026-08', '2026-07'])

    const september = periods[0]
    expect(september.trips.map((t) => t.id)).toEqual(['t3', 't2'])
    // Thursday Sep 3 (W36) and Sunday Sep 27 (W39); W36's Monday dinner is August's.
    expect(september.meals.map((m) => m.recipeName)).toEqual(['Soup', 'Tacos'])
    expect(september.end).toEqual(new Date(2026, 8, 30))

    const august = periods[1]
    expect(august.trips.map((t) => t.id)).toEqual(['t1'])
    expect(august.spent).toBe(1249.5)
    // Monday Aug 31 is the one August dinner of W36.
    expect(august.meals.map((m) => m.recipeName)).toEqual(['Tacos'])

    expect(periods.flatMap((p) => p.trips).some((t) => t.id === 'old')).toBe(false)
  })
})

describe('summarize / hasAnyRecord', () => {
  it('adds up spend, trips and meals across the window and averages per period', () => {
    const summary = summarize(buildPeriods(weeks, 'month', now))
    expect(summary).toEqual({
      spent: 1869.5,
      trips: 3,
      unpricedTrips: 1,
      meals: 3,
      averagePerPeriod: 1869.5 / 12,
    })
    expect(summarize([])).toEqual({ spent: 0, trips: 0, unpricedTrips: 0, meals: 0, averagePerPeriod: 0 })
  })

  it('knows an empty record from a quiet one', () => {
    expect(hasAnyRecord(weeks)).toBe(true)
    expect(hasAnyRecord([{ weekId: '2026-W01', meals: [], trips: [] }])).toBe(false)
  })
})
