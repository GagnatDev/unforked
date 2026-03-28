import type { TFunction } from 'i18next'
import type { DayAssignment, Recipe } from '@/types'
import type { DayKey } from './constants'

export function MealPlanRecipeSelect({
  day,
  byDay,
  recipes,
  setAssignment,
  t,
  className,
  idSuffix,
}: {
  day: DayKey
  byDay: Record<string, DayAssignment | undefined>
  recipes: Recipe[]
  setAssignment: (day: string, recipeId: string | null, recipeName: string) => void
  t: TFunction
  className: string
  idSuffix: 'mobile' | 'desktop'
}) {
  const dayLabel = t(`mealPlan.days.${day}`)
  const id = `meal-plan-recipe-${idSuffix}-${day}`
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {t('mealPlan.recipeForDay', { day: dayLabel })}
      </label>
      <select
        id={id}
        value={byDay[day]?.recipeId ?? ''}
        onChange={(e) => {
          const opt = e.target.selectedOptions[0]
          setAssignment(day, e.target.value || null, opt?.text ?? '')
        }}
        className={className}
      >
        <option value="">{t('mealPlan.noRecipe')}</option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.doc.name}
          </option>
        ))}
      </select>
    </>
  )
}
