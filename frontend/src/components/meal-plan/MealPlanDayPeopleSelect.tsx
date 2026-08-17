import { useTranslation } from 'react-i18next'
import { UsersIcon } from 'lucide-react'
import type { DayAssignment } from '@/types'
import type { DayKey } from './constants'
import { MealPlanPeopleSelect } from './MealPlanPeopleSelect'

export function MealPlanDayPeopleSelect({
  day,
  byDay,
  defaultPersons,
  setDayPeople,
  className,
  id,
}: {
  day: DayKey
  byDay: Record<string, DayAssignment | undefined>
  defaultPersons: number | null
  setDayPeople: (day: string, persons: number | null) => void
  className: string
  id?: string
}) {
  const { t } = useTranslation()
  const hasRecipe = Boolean(byDay[day]?.recipeId)

  return (
    <MealPlanPeopleSelect
      id={id}
      value={byDay[day]?.persons ?? null}
      onValueChange={(persons) => setDayPeople(day, persons)}
      disabled={!hasRecipe}
      // Unset means "fall back to the week default", so name that number when
      // there is one rather than leaving the entry blank.
      emptyLabel={
        defaultPersons != null
          ? t('mealPlan.dayPeopleDefaultOption', { persons: defaultPersons })
          : t('mealPlan.peopleUnset')
      }
      ariaLabel={t('mealPlan.dayPeopleAriaLabel', {
        day: t(`mealPlan.days.${day}`),
      })}
      className={className}
      icon={<UsersIcon className="shrink-0 text-muted-foreground" />}
    />
  )
}
