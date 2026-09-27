import {
  addDays,
  addWeeks,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
  subWeeks,
} from 'date-fns'

import { DAYS } from '@/components/meal-plan/constants'
import { mondayOfWeekId, weekIdFromDate } from '@/lib/week-id'
import type { InsightsMeal, InsightsTrip, InsightsWeek } from '@/types'

export type Granularity = 'week' | 'month'

/** How many periods the page shows at once, for either granularity. */
export const PERIOD_COUNT = 12

export interface PeriodTrip extends InsightsTrip {
  /** The week whose list the trip came from. */
  weekId: string
  date: Date
}

export interface PeriodMeal extends InsightsMeal {
  weekId: string
  date: Date
}

export interface Period {
  /** "2026-W39" for a week, "2026-09" for a month. */
  key: string
  granularity: Granularity
  start: Date
  /** Inclusive last day of the period. */
  end: Date
  /** Newest first. */
  trips: PeriodTrip[]
  /** In calendar order. */
  meals: PeriodMeal[]
  /** Sum of the trips that carry an amount. */
  spent: number
  /** Trips whose amount was never recorded. */
  unpricedTrips: number
}

export interface InsightsSummary {
  spent: number
  trips: number
  unpricedTrips: number
  meals: number
  /** Spend per period over the range, empty periods included. */
  averagePerPeriod: number
}

/** The calendar day a planned dinner falls on; unknown day names sit on the Monday. */
export function dayDate(weekId: string, day: string): Date | null {
  const monday = mondayOfWeekId(weekId)
  if (!monday) return null
  const offset = (DAYS as readonly string[]).indexOf(day)
  return addDays(monday, offset < 0 ? 0 : offset)
}

export function periodKey(date: Date, granularity: Granularity): string {
  return granularity === 'week' ? weekIdFromDate(date) : format(date, 'yyyy-MM')
}

/** The `PERIOD_COUNT` periods ending on the one containing `now`, oldest first. */
export function periodStarts(now: Date, granularity: Granularity): Date[] {
  if (granularity === 'week') {
    const thisMonday = mondayOfWeekId(weekIdFromDate(now))!
    return Array.from({ length: PERIOD_COUNT }, (_, i) => subWeeks(thisMonday, PERIOD_COUNT - 1 - i))
  }
  const thisMonth = startOfMonth(now)
  return Array.from({ length: PERIOD_COUNT }, (_, i) => subMonths(thisMonth, PERIOD_COUNT - 1 - i))
}

/**
 * The inclusive week-id range to fetch so every period is fully covered. A
 * list belongs to the week it feeds, but its trips may have been paid the
 * week before (Sunday shopping for Monday), so the range reaches one week
 * past the end as well as back to the first period's start.
 */
export function fetchRange(now: Date): { from: string; to: string } {
  const earliest = periodStarts(now, 'month')[0]
  return {
    from: weekIdFromDate(earliest),
    to: weekIdFromDate(addWeeks(now, 1)),
  }
}

function emptyPeriod(start: Date, granularity: Granularity): Period {
  return {
    key: periodKey(start, granularity),
    granularity,
    start,
    end: granularity === 'week' ? addDays(start, 6) : startOfDay(endOfMonth(start)),
    trips: [],
    meals: [],
    spent: 0,
    unpricedTrips: 0,
  }
}

/**
 * Regroup the server's per-list weeks into calendar periods. Trips land in
 * the period they were *paid* in (that is what spending means), meals in the
 * period of the day they were planned for. Every period in the window is
 * returned, empty ones included, newest first — a month with no trips is a
 * fact worth seeing, not a gap to hide.
 */
export function buildPeriods(
  weeks: readonly InsightsWeek[],
  granularity: Granularity,
  now: Date = new Date(),
): Period[] {
  const periods = new Map<string, Period>()
  for (const start of periodStarts(now, granularity)) {
    const period = emptyPeriod(start, granularity)
    periods.set(period.key, period)
  }

  for (const week of weeks) {
    for (const trip of week.trips) {
      const date = new Date(trip.completedAt)
      if (Number.isNaN(date.getTime())) continue
      const period = periods.get(periodKey(date, granularity))
      if (!period) continue
      period.trips.push({ ...trip, weekId: week.weekId, date })
      if (trip.totalCost !== undefined) period.spent += trip.totalCost
      else period.unpricedTrips += 1
    }
    for (const meal of week.meals) {
      const date = dayDate(week.weekId, meal.day)
      if (!date) continue
      const period = periods.get(periodKey(date, granularity))
      if (!period) continue
      period.meals.push({ ...meal, weekId: week.weekId, date })
    }
  }

  const list = [...periods.values()]
  for (const period of list) {
    period.trips.sort((a, b) => b.date.getTime() - a.date.getTime())
    period.meals.sort((a, b) => a.date.getTime() - b.date.getTime())
  }
  return list.reverse()
}

export function summarize(periods: readonly Period[]): InsightsSummary {
  const spent = periods.reduce((sum, p) => sum + p.spent, 0)
  return {
    spent,
    trips: periods.reduce((sum, p) => sum + p.trips.length, 0),
    unpricedTrips: periods.reduce((sum, p) => sum + p.unpricedTrips, 0),
    meals: periods.reduce((sum, p) => sum + p.meals.length, 0),
    averagePerPeriod: periods.length > 0 ? spent / periods.length : 0,
  }
}

/** Whether the family has recorded anything at all in the fetched range. */
export function hasAnyRecord(weeks: readonly InsightsWeek[]): boolean {
  return weeks.some((week) => week.trips.length > 0 || week.meals.length > 0)
}
