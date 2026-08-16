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

/**
 * Head counts offered by the people dropdowns. A household plans dinner for a
 * handful of people, so a short fixed list beats free-text entry; plans that
 * already carry a larger number keep it (see `MealPlanPeopleSelect`).
 */
export const PEOPLE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
