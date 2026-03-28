import type { TFunction } from 'i18next'
import type { DayAssignment } from '@/types'
import type { DayKey } from './constants'

export function MealPlanDayPeopleInput({
  day,
  byDay,
  setDayPeople,
  t,
  className,
}: {
  day: DayKey
  byDay: Record<string, DayAssignment | undefined>
  setDayPeople: (day: string, raw: string) => void
  t: TFunction
  className: string
}) {
  return (
    <input
      type="number"
      min={1}
      step={1}
      disabled={!byDay[day]?.recipeId}
      aria-label={t('mealPlan.dayPeopleAriaLabel', {
        day: t(`mealPlan.days.${day}`),
      })}
      value={byDay[day]?.persons ?? ''}
      onChange={(e) => setDayPeople(day, e.target.value)}
      className={className}
    />
  )
}
