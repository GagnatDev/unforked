import { addWeeks, getISOWeek, getISOWeekYear } from "date-fns";

/** ISO 8601 week identifier, e.g. "2026-W02". Ported from the Kotlin helper. */
export function currentWeekIdentifier(date: Date = new Date()): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The ISO week after the given date's — week 52/53 rollovers included. */
export function nextWeekIdentifier(date: Date = new Date()): string {
  return currentWeekIdentifier(addWeeks(date, 1));
}

const WEEK_IDENTIFIER_PATTERN = /^\d{4}-W\d{2}$/;

/**
 * Resolve a machine-API week path segment: the `current`/`next` aliases (kept
 * server-side so callers never re-implement ISO-week arithmetic) or a literal
 * `YYYY-Wnn`. Returns null for anything else.
 */
export function resolveWeekAlias(raw: string, now: Date = new Date()): string | null {
  if (raw === "current") return currentWeekIdentifier(now);
  if (raw === "next") return nextWeekIdentifier(now);
  return WEEK_IDENTIFIER_PATTERN.test(raw) ? raw : null;
}
