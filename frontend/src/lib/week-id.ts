import {
  addWeeks,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from 'date-fns'

const WEEK_ID_RE = /^(\d{4})-W(\d{2})$/

/** ISO 8601 week id (Monday first), e.g. "2025-W10". Matches backend IsoFields week-based year. */
export function weekIdFromDate(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Year and week numbers of a week id, or null if it isn't shaped like one. */
export function parseWeekId(value: string): { year: number; week: number } | null {
  const match = WEEK_ID_RE.exec(value)
  if (!match) return null
  return { year: Number(match[1]), week: Number(match[2]) }
}

/** True when `value` is shaped like a week id — e.g. a `?week=` URL param. */
export function isWeekId(value: string | null | undefined): value is string {
  return value != null && parseWeekId(value) !== null
}

/** Monday of the given ISO week id, or null if invalid / not a real ISO week. */
export function mondayOfWeekId(weekId: string): Date | null {
  const parsed = parseWeekId(weekId)
  if (!parsed) return null
  const { year, week } = parsed
  if (week < 1 || week > 53) return null
  const anchor = new Date(year, 0, 4)
  const d = startOfISOWeek(setISOWeek(setISOWeekYear(anchor, year), week))
  if (weekIdFromDate(d) !== weekId) return null
  return d
}

/**
 * The week id `weeks` weeks after `weekId` (negative moves back), or null if
 * `weekId` isn't a valid week id. Year and 52/53-week boundaries follow from
 * the shifted Monday, so stepping past new year lands on the right ISO week.
 */
export function shiftWeekId(weekId: string, weeks: number): string | null {
  const monday = mondayOfWeekId(weekId)
  if (!monday) return null
  return weekIdFromDate(addWeeks(monday, weeks))
}
