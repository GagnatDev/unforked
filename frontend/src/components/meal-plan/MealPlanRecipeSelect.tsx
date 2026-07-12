import { useTranslation } from 'react-i18next'
import type { DayAssignment, Recipe } from '@/types'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { DayKey } from './constants'

export function MealPlanRecipeSelect({
  day,
  byDay,
  recipes,
  setAssignment,
  className,
  idSuffix,
}: {
  day: DayKey
  byDay: Record<string, DayAssignment | undefined>
  recipes: Recipe[]
  setAssignment: (day: string, recipeId: string | null, recipeName: string) => void
  className: string
  idSuffix: 'mobile' | 'desktop'
}) {
  const { t } = useTranslation()
  const dayLabel = t(`mealPlan.days.${day}`)
  const id = `meal-plan-recipe-${idSuffix}-${day}`
  const value = byDay[day]?.recipeId ?? ''

  // Base UI's Select.Value renders the raw value (the recipe id) unless the
  // root is given an items map, so provide value -> label entries here.
  const items = [
    { value: '', label: t('mealPlan.noRecipe') },
    ...recipes.map((r) => ({ value: r.id, label: r.doc.name })),
  ]

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {t('mealPlan.recipeForDay', { day: dayLabel })}
      </label>
      <Select
        items={items}
        value={value}
        onValueChange={(recipeId) => {
          if (!recipeId) {
            setAssignment(day, null, '')
            return
          }
          const r = recipes.find((x) => x.id === recipeId)
          setAssignment(day, recipeId, r?.doc.name ?? '')
        }}
      >
        <SelectTrigger id={id} className={cn('w-full', className)}>
          <SelectValue placeholder={t('mealPlan.noRecipe')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="">{t('mealPlan.noRecipe')}</SelectItem>
            {recipes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.doc.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}
