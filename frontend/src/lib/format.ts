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
 * Format a week identifier (e.g. "2025-W10") for display in the given locale.
 * Returns a human-readable string like "Week 10, 2025" (en) or "Uke 10, 2025" (nb).
 */
export function formatWeekId(weekId: string, locale: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId)
  if (!match) return weekId
  const [, year, week] = match
  if (locale.startsWith('nb')) {
    return `Uke ${Number(week)}, ${year}`
  }
  return `Week ${Number(week)}, ${year}`
}
