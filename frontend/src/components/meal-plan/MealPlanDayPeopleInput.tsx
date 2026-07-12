import { useTranslation } from 'react-i18next'
import { UsersIcon } from 'lucide-react'
import type { DayAssignment } from '@/types'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import type { DayKey } from './constants'

export function MealPlanDayPeopleInput({
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
  setDayPeople: (day: string, raw: string) => void
  className: string
  id?: string
}) {
  const { t } = useTranslation()
  const hasRecipe = Boolean(byDay[day]?.recipeId)

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <UsersIcon />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        disabled={!hasRecipe}
        placeholder={
          hasRecipe && defaultPersons != null ? String(defaultPersons) : undefined
        }
        aria-label={t('mealPlan.dayPeopleAriaLabel', {
          day: t(`mealPlan.days.${day}`),
        })}
        value={byDay[day]?.persons ?? ''}
        onChange={(e) => setDayPeople(day, e.target.value)}
      />
    </InputGroup>
  )
}
