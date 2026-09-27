import { addDays } from 'date-fns'

import { mondayOfWeekId, parseWeekId } from '@/lib/week-id'

/**
 * Locale-aware date and number formatting using the Intl API.
 * Pass the current locale (e.g. from i18n.resolvedLanguage) so formatting
 * respects the active language.
 */

/**
 * Format a date for display in the given locale.
 */
export function formatDate(
  date: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...options,
  }).format(date)
}

/**
 * Format a number for display in the given locale.
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

/**
 * Format an ISO timestamp from the API as a short date, or "" if it isn't a
 * usable date. Timestamps arrive as strings everywhere, so callers shouldn't
 * each have to build a Date and check it.
 */
export function formatIsoDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, { dateStyle: 'short' })
}

/** As {@link formatIsoDate}, with the time of day. */
export function formatIsoDateTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Time only when the timestamp is from today, date + time otherwise — for
 * "started 14:32" style labels where the date is noise most of the time.
 */
export function formatIsoTimeOrDateTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : formatIsoDateTime(iso, locale)
}

/**
 * The day a thing happened, with its time — "Sat, Sep 26, 14:32" (en) or
 * "lør. 26. sep., 14:32" (nb). For records read back later (a trip in the
 * week's history), where the date is the point and never noise.
 */
export function formatIsoDayDateTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * An amount in kroner: "1 249,50 kr" (nb), "1,249.50 kr" (en). Whole amounts
 * drop the decimals ("349 kr"). The unit is spelled the way the family says
 * it, whatever the display language.
 */
export function formatKroner(value: number, locale: string): string {
  return `${formatNumber(value, locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`
}

/** A calendar month for a heading: "September 2026" / "september 2026". */
export function formatMonth(date: Date, locale: string): string {
  const text = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

/**
 * Format a week identifier (e.g. "2025-W10") for display in the given locale.
 * Returns a human-readable string like "Week 10, 2025" (en) or "Uke 10, 2025" (nb).
 */
export function formatWeekId(weekId: string, locale: string): string {
  const parsed = parseWeekId(weekId)
  if (!parsed) return weekId
  const { year, week } = parsed
  if (locale.startsWith('nb')) {
    return `Uke ${week}, ${year}`
  }
  return `Week ${week}, ${year}`
}

/**
 * Format the days a week covers, e.g. "Aug 24 – 30" (en) or "24.–30. aug."
 * (nb) — and across a month boundary "Aug 31 – Sep 6". This is what people
 * actually recognize a week by; the week number alone rarely is.
 * Falls back to the raw id when it isn't a real ISO week.
 */
export function formatWeekRange(weekId: string, locale: string): string {
  const monday = mondayOfWeekId(weekId)
  if (!monday) return weekId
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).formatRange(monday, addDays(monday, 6))
}
