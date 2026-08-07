import { parseWeekId } from '@/lib/week-id'

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
