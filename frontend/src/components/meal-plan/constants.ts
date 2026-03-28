export const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export type DayKey = (typeof DAYS)[number]

export const mealPlanControlClass =
  'rounded-md border border-input bg-background px-3 py-2 text-foreground'
