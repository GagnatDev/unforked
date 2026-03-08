import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ISO 8601 week id (Monday = first day of week), e.g. "2025-W10". */
export function getCurrentWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7 // 1 = Monday .. 7 = Sunday
  d.setUTCDate(d.getUTCDate() + 4 - dayNum) // Thursday of this week
  const year = d.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1Day = jan1.getUTCDay() || 7
  const firstThursday = new Date(Date.UTC(year, 0, 1 + ((11 - jan1Day) % 7)))
  const weekNo = 1 + Math.floor((d.getTime() - firstThursday.getTime()) / 604_800_000)
  return `${year}-W${String(weekNo).padStart(2, "0")}`
}
