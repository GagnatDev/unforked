import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MealPlanWeekAssignments } from '@/components/meal-plan/MealPlanWeekAssignments'
import { DAYS } from '@/components/meal-plan/constants'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { getNextWeekId } from '@/lib/utils'
import { api } from '../api'
import type { MealPlanDoc, DayAssignment, Recipe } from '../types'

function parsePositiveInt(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

export default function MealPlan() {
  const { t, i18n } = useTranslation()
  const [weekId, setWeekId] = useState(getNextWeekId)
  const [plan, setPlan] = useState<MealPlanDoc | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.mealPlans.getCurrent(weekId),
      api.recipes.list(),
      api.family.get().catch(() => null),
    ])
      .then(([planData, recipesData, familyData]) => {
        if (!cancelled) {
          let merged = planData
          if (
            merged.defaultPersons == null &&
            familyData != null &&
            familyData.defaultMealPlanPersons != null
          ) {
            merged = { ...merged, defaultPersons: familyData.defaultMealPlanPersons }
          }
          setPlan(merged)
          setRecipes(recipesData)
        }
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
  }, [weekId])

  const assignments = plan?.assignments ?? []
  const byDay = Object.fromEntries(assignments.map((a) => [a.day, a]))

  const setAssignment = (day: string, recipeId: string | null, recipeName: string) => {
    if (!plan) return
    const prev = byDay[day]
    const next: DayAssignment[] = DAYS.map((d) => {
      if (d !== day) return byDay[d] ?? { day: d, recipeId: '', recipeName: '' }
      if (!recipeId) return { day, recipeId: '', recipeName: '' }
      return { day, recipeId, recipeName, persons: prev?.persons ?? null }
    }).filter((a) => a.recipeId)
    const doc: MealPlanDoc = {
      weekIdentifier: weekId,
      defaultPersons: plan.defaultPersons ?? null,
      assignments: next,
    }
    setPlan(doc)
  }

  const setDefaultPeople = (raw: string) => {
    if (!plan) return
    setPlan({
      ...plan,
      defaultPersons: parsePositiveInt(raw),
    })
  }

  const setDayPeople = (day: string, raw: string) => {
    if (!plan) return
    const assignment = byDay[day]
    if (!assignment?.recipeId) return
    const persons = parsePositiveInt(raw)
    setPlan({
      ...plan,
      assignments: plan.assignments.map((a) =>
        a.day === day ? { ...a, persons } : a
      ),
    })
  }

  const save = async () => {
    if (!plan) return
    setSaving(true)
    setError(null)
    try {
      await api.mealPlans.putCurrent(plan, weekId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1>{t('mealPlan.title')}</h1>
      <div className="mb-4">
        <WeekPicker
          value={weekId}
          onChange={setWeekId}
          locale={i18n.resolvedLanguage ?? i18n.language}
        />
      </div>
      {loading ? (
        <p>{t('mealPlan.loading')}</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <>
          <div className="mb-4 max-w-md space-y-1">
            <label htmlFor="meal-plan-default-people" className="text-sm font-medium">
              {t('mealPlan.defaultPeople')}
            </label>
            <input
              id="meal-plan-default-people"
              type="number"
              min={1}
              step={1}
              value={plan?.defaultPersons ?? ''}
              onChange={(e) => setDefaultPeople(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
            />
            <p className="text-sm text-muted-foreground">{t('mealPlan.defaultPeopleHint')}</p>
          </div>
          <MealPlanWeekAssignments
            t={t}
            byDay={byDay}
            recipes={recipes}
            setAssignment={setAssignment}
            setDayPeople={setDayPeople}
          />
          <p className="mt-4">
            <Button onClick={save} disabled={saving}>
              {saving ? t('mealPlan.saving') : t('mealPlan.savePlan')}
            </Button>
          </p>
        </>
      )}
    </div>
  )
}
