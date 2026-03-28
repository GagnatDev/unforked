import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { weekIdFromDate } from "@/lib/week-id"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ISO 8601 week id (Monday = first day of week), e.g. "2025-W10". */
export function getCurrentWeekId(date: Date = new Date()): string {
  return weekIdFromDate(date)
}
