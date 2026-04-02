import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getISODay } from 'date-fns'
import { Button } from '@/components/ui/button'
import { cn, getCurrentWeekId } from '@/lib/utils'
import { api } from '../api'
import type { DayAssignment, MealPlanDoc, Recipe } from '../types'

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

type WakeLockSentinelLike = { release: () => Promise<void> }

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
  const [wakeLockSupported, setWakeLockSupported] = useState(false)
  const [wakeLock, setWakeLock] = useState<WakeLockSentinelLike | null>(null)

  const checklistStorageKey = useMemo(() => {
    if (!recipe?.id) return null
    return `today:steps:${dateKey}:${recipe.id}`
  }, [dateKey, recipe?.id])

  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([])

  useEffect(() => {
    setWakeLockSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  }, [])

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

  useEffect(() => {
    const steps = recipe?.doc.steps ?? []
    if (!checklistStorageKey || steps.length === 0) {
      setCheckedSteps(steps.map(() => false))
      return
    }
    try {
      const raw = localStorage.getItem(checklistStorageKey)
      if (!raw) {
        setCheckedSteps(steps.map(() => false))
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) {
        setCheckedSteps(steps.map(() => false))
        return
      }
      const next = steps.map((_, i) => Boolean(parsed[i]))
      setCheckedSteps(next)
    } catch {
      setCheckedSteps(steps.map(() => false))
    }
  }, [checklistStorageKey, recipe?.doc.steps])

  useEffect(() => {
    if (!checklistStorageKey) return
    try {
      localStorage.setItem(checklistStorageKey, JSON.stringify(checkedSteps))
    } catch {
      // ignore quota/private mode issues
    }
  }, [checklistStorageKey, checkedSteps])

  useEffect(() => {
    if (!keepAwake) return
    if (!wakeLockSupported) return
    let released = false
    const request = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wl = await (navigator as any).wakeLock.request('screen')
        if (!released) setWakeLock(wl as WakeLockSentinelLike)
        // If the lock is released by the UA, reflect it in UI.
        wl.addEventListener?.('release', () => setWakeLock(null))
      } catch {
        setWakeLock(null)
      }
    }
    void request()
    return () => {
      released = true
    }
  }, [keepAwake, wakeLockSupported])

  useEffect(() => {
    if (keepAwake) return
    if (!wakeLock) return
    void wakeLock.release().finally(() => setWakeLock(null))
  }, [keepAwake, wakeLock])

  const plannedPeople =
    assignment?.persons ?? plan?.defaultPersons ?? null

  const toggleStep = (idx: number) => {
    setCheckedSteps((prev) => prev.map((v, i) => (i === idx ? !v : v)))
  }

  const resetProgress = () => {
    const steps = recipe?.doc.steps ?? []
    setCheckedSteps(steps.map(() => false))
    if (checklistStorageKey) {
      try {
        localStorage.removeItem(checklistStorageKey)
      } catch {
        // ignore
      }
    }
  }

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
  const steps = recipe.doc.steps

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

        <div className="rounded-lg border border-border bg-card px-4 py-3 text-card-foreground">
          <div>
            <div className="text-lg font-semibold">{recipe.doc.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {plannedPeople != null && (
                <span>
                  {t('mealPlan.people')}: {plannedPeople}
                </span>
              )}
              {recipe.doc.servings > 0 && (
                <span>{t('recipes.serves', { count: recipe.doc.servings })}</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepAwake}
                onChange={(e) => setKeepAwake(e.target.checked)}
                disabled={!wakeLockSupported}
              />
              {t('today.keepAwake')}
            </label>
            {!wakeLockSupported && (
              <span className="text-sm text-muted-foreground">{t('today.keepAwakeUnsupported')}</span>
            )}
          </div>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('today.ingredients')}</h2>
        {ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="list-none p-0 space-y-2">
            {ingredients.map((ing, i) => {
              const left = [ing.quantity, ing.unit].filter(Boolean).join(' ').trim()
              const text = `${left ? `${left} ` : ''}${ing.name}`.trim()
              return (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-card-foreground"
                >
                  {text}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('today.steps')}</h2>
          <Button variant="outline" size="sm" onClick={resetProgress} disabled={steps.length === 0}>
            {t('today.resetProgress')}
          </Button>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ol className="list-none p-0 space-y-2">
            {steps.map((step, i) => {
              const checked = Boolean(checkedSteps[i])
              return (
                <li
                  key={i}
                  className={cn(
                    'rounded-lg border border-border bg-card px-3 py-3 text-card-foreground',
                    checked && 'opacity-70'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleStep(i)}
                    className="flex w-full items-start gap-3 text-left"
                    aria-pressed={checked}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="mt-1 h-5 w-5"
                      aria-label={`${t('today.steps')} ${i + 1}`}
                    />
                    <div className="flex-1 whitespace-pre-wrap">
                      <span className="mr-2 font-medium text-muted-foreground">{i + 1}.</span>
                      {step}
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

