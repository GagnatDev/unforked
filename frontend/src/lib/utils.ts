import { clsx, type ClassValue } from "clsx"
import { getISOWeek, getISOWeekYear } from "date-fns"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ISO 8601 week id (Monday = first day of week), e.g. "2025-W10". */
export function getCurrentWeekId(date: Date = new Date()): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, "0")}`
}
