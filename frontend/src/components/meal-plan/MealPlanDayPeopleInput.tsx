import { useTranslation } from 'react-i18next'
import type { DayAssignment } from '@/types'
import { Input } from '@/components/ui/input'
import type { DayKey } from './constants'

export function MealPlanDayPeopleInput({
  day,
  byDay,
  setDayPeople,
  className,
}: {
  day: DayKey
  byDay: Record<string, DayAssignment | undefined>
  setDayPeople: (day: string, raw: string) => void
  className: string
}) {
  const { t } = useTranslation()

  return (
    <Input
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
