import { useTranslation } from 'react-i18next'
import type { DayAssignment, Recipe } from '@/types'
import { DAYS } from './constants'
import { MealPlanDayPeopleInput } from './MealPlanDayPeopleInput'
import { MealPlanRecipeSelect } from './MealPlanRecipeSelect'

export function MealPlanWeekAssignments({
  byDay,
  recipes,
  setAssignment,
  setDayPeople,
}: {
  byDay: Record<string, DayAssignment | undefined>
  recipes: Recipe[]
  setAssignment: (day: string, recipeId: string | null, recipeName: string) => void
  setDayPeople: (day: string, raw: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="divide-y divide-border md:hidden">
        {DAYS.map((day) => (
          <div key={day} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-foreground">{t(`mealPlan.days.${day}`)}</span>
              <MealPlanDayPeopleInput
                day={day}
                byDay={byDay}
                setDayPeople={setDayPeople}
                className="w-16 min-w-0 shrink-0 disabled:opacity-50"
              />
            </div>
            <div className="mt-2">
              <MealPlanRecipeSelect
                day={day}
                byDay={byDay}
                recipes={recipes}
                setAssignment={setAssignment}
                className="w-full"
                idSuffix="mobile"
              />
            </div>
          </div>
        ))}
      </div>
      <table className="hidden w-full border-collapse text-foreground md:table">
        <thead>
          <tr className="border-b-2 border-border">
            <th className="p-3 text-left">{t('mealPlan.day')}</th>
            <th className="p-3 text-left">{t('mealPlan.recipe')}</th>
            <th className="w-36 p-3 text-left">{t('mealPlan.people')}</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => (
            <tr key={day} className="border-b border-border">
              <td className="p-3">{t(`mealPlan.days.${day}`)}</td>
              <td className="p-3">
                <MealPlanRecipeSelect
                  day={day}
                  byDay={byDay}
                  recipes={recipes}
                  setAssignment={setAssignment}
                  className="w-full"
                  idSuffix="desktop"
                />
              </td>
              <td className="p-3">
                <MealPlanDayPeopleInput
                  day={day}
                  byDay={byDay}
                  setDayPeople={setDayPeople}
                  className="w-full min-w-0 disabled:opacity-50"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
