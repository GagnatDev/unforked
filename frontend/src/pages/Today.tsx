import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getISODay } from 'date-fns'
import type { DayKey } from '@/components/meal-plan/constants'
import { formatLoadErrorMessage } from '@/lib/loadErrors'
import { cn, getCurrentWeekId } from '@/lib/utils'
import { getLocalMealPlan, getLocalRecipe } from '@/local/db'
import { pullMealPlan, pullRecipe } from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import { TodayIngredients } from './today/TodayIngredients'
import { TodayMealCard } from './today/TodayMealCard'
import { TodayStepChecklist } from './today/TodayStepChecklist'
import { useStepChecklist } from './today/useStepChecklist'
import { useWakeLock } from './today/useWakeLock'

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

  const { data, loading: localLoading } = useLocal(
    async () => {
      const p = await getLocalMealPlan(weekId)
      if (!p) return null
      const assignment =
        (p.assignments ?? []).find((x) => x.day === dayKey) ?? null
      if (!assignment?.recipeId) return { plan: p, assignment, recipe: null }
      const recipe = await getLocalRecipe(assignment.recipeId)
      // The assigned recipe isn't local yet: treat as unknown until pulled.
      if (!recipe) return null
      return { plan: p, assignment, recipe }
    },
    ['mealPlans', 'recipes'],
    [dayKey, weekId],
  )
  const { error: pullError } = useBackgroundPull(
    async () => {
      await pullMealPlan(weekId)
      const p = await getLocalMealPlan(weekId)
      const assignment = (p?.assignments ?? []).find((x) => x.day === dayKey)
      if (assignment?.recipeId) await pullRecipe(assignment.recipeId)
    },
    [dayKey, weekId],
  )
  // With nothing local yet, stay in loading until the pull lands in the
  // store (or fails); with local data, pull errors are irrelevant offline noise.
  const loading = localLoading || (data == null && pullError == null)
  const error = data == null ? pullError : null

  const plan = data?.plan ?? null
  const assignment = data?.assignment ?? null
  const recipe = data?.recipe ?? null

  const [keepAwake, setKeepAwake] = useState(false)
  const { wakeLockSupported } = useWakeLock(keepAwake)

  const checklistStorageKey = useMemo(() => {
    if (!recipe?.id) return null
    return `today:steps:${dateKey}:${recipe.id}`
  }, [dateKey, recipe?.id])

  const steps = useMemo(() => recipe?.doc.steps ?? [], [recipe])
  const { checkedSteps, toggleStep, resetProgress } = useStepChecklist(steps, checklistStorageKey)

  const plannedPeople = assignment?.persons ?? plan?.defaultPersons ?? null

  if (loading) return <p>{t('today.loading')}</p>
  if (error) {
    return (
      <p className="text-destructive">{formatLoadErrorMessage(error, t)}</p>
    )
  }

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
