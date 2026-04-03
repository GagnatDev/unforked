import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getISODay } from 'date-fns'
import { cn, getCurrentWeekId } from '@/lib/utils'
import { api } from '../api'
import type { DayAssignment, MealPlanDoc, Recipe } from '../types'
import { TodayIngredients } from './today/TodayIngredients'
import { TodayMealCard } from './today/TodayMealCard'
import { TodayStepChecklist } from './today/TodayStepChecklist'
import { useStepChecklist } from './today/useStepChecklist'
import { useWakeLock } from './today/useWakeLock'

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

function dayKeyFromDate(date: Date): DayKey {
  const iso = getISODay(date) // 1=Mon..7=Sun
  switch (iso) {
    case 1:
      return 'monday'
    case 2:
      return 'tuesday'
    case 3:
      return 'wednesday'
    case 4:
      return 'thursday'
    case 5:
      return 'friday'
    case 6:
      return 'saturday'
    default:
      return 'sunday'
  }
}

function weekNumberFromWeekId(weekId: string): number | null {
  const match = /-W(\d{2})$/.exec(weekId)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n) || n < 1 || n > 53) return null
  return n
}

export default function Today() {
  const { t } = useTranslation()

  const now = useMemo(() => new Date(), [])
  const dayKey = useMemo(() => dayKeyFromDate(now), [now])
  const weekId = useMemo(() => getCurrentWeekId(now), [now])
  const weekNumber = useMemo(() => weekNumberFromWeekId(weekId), [weekId])
  const dateKey = useMemo(() => now.toISOString().slice(0, 10), [now])

  const [plan, setPlan] = useState<MealPlanDoc | null>(null)
  const [assignment, setAssignment] = useState<DayAssignment | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [keepAwake, setKeepAwake] = useState(false)
  const { wakeLockSupported } = useWakeLock(keepAwake)

  const checklistStorageKey = useMemo(() => {
    if (!recipe?.id) return null
    return `today:steps:${dateKey}:${recipe.id}`
  }, [dateKey, recipe?.id])

  const steps = useMemo(() => recipe?.doc.steps ?? [], [recipe])
  const { checkedSteps, toggleStep, resetProgress } = useStepChecklist(steps, checklistStorageKey)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPlan(null)
    setAssignment(null)
    setRecipe(null)

    api.mealPlans
      .getCurrent(weekId)
      .then((p) => {
        if (cancelled) return
        setPlan(p)
        const a = p.assignments.find((x) => x.day === dayKey) ?? null
        setAssignment(a)
        if (!a?.recipeId) return null
        return api.recipes.get(a.recipeId)
      })
      .then((r) => {
        if (cancelled) return
        if (r) setRecipe(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dayKey, weekId])

  const plannedPeople = assignment?.persons ?? plan?.defaultPersons ?? null

  if (loading) return <p>{t('today.loading')}</p>
  if (error) return <p className="text-destructive">{error}</p>

  if (!assignment?.recipeId || !recipe) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('today.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`mealPlan.days.${dayKey}`)} ·{' '}
            {weekNumber != null ? t('today.week', { week: weekNumber }) : weekId}
          </p>
        </div>
        <p>{t('today.noMealPlanned')}</p>
        <p>
          <Link to="/meal-plan" className={cn('text-primary underline-offset-4 hover:underline')}>
            {t('today.goToMealPlan')}
          </Link>
        </p>
      </div>
    )
  }

  const ingredients = recipe.doc.ingredients

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div>
          <h1 className="text-xl font-semibold">{t('today.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`mealPlan.days.${dayKey}`)} ·{' '}
            {weekNumber != null ? t('today.week', { week: weekNumber }) : weekId}
          </p>
        </div>

        <TodayMealCard
          recipeName={recipe.doc.name}
          plannedPeople={plannedPeople}
          servings={recipe.doc.servings}
          keepAwake={keepAwake}
          onKeepAwakeChange={setKeepAwake}
          wakeLockSupported={wakeLockSupported}
        />
      </header>

      <TodayIngredients ingredients={ingredients} />

      <TodayStepChecklist
        steps={steps}
        checkedSteps={checkedSteps}
        onToggleStep={toggleStep}
        onResetProgress={resetProgress}
      />
    </div>
  )
}
