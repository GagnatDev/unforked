import { getISOWeek, getISOWeekYear } from "date-fns";

/** ISO 8601 week identifier, e.g. "2026-W02". Ported from the Kotlin helper. */
export function currentWeekIdentifier(date: Date = new Date()): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
