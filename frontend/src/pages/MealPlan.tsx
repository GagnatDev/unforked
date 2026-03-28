import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { getCurrentWeekId } from '@/lib/utils'
import { api } from '../api'
import type { MealPlanDoc, DayAssignment, Recipe } from '../types'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

function getInitialWeekId(): string {
  return getCurrentWeekId()
}

function parsePositiveInt(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

export default function MealPlan() {
  const { t, i18n } = useTranslation()
  const [weekId, setWeekId] = useState(getInitialWeekId())
  const [plan, setPlan] = useState<MealPlanDoc | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.mealPlans.getCurrent(weekId), api.recipes.list()])
      .then(([planData, recipesData]) => {
        if (!cancelled) {
          setPlan(planData)
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
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full border-collapse text-foreground">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left p-3">{t('mealPlan.day')}</th>
                  <th className="text-left p-3">{t('mealPlan.recipe')}</th>
                  <th className="text-left p-3 w-36">{t('mealPlan.people')}</th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day} className="border-b border-border">
                    <td className="p-3">{t(`mealPlan.days.${day}`)}</td>
                    <td className="p-3">
                      <select
                        value={byDay[day]?.recipeId ?? ''}
                        onChange={(e) => {
                          const opt = e.target.selectedOptions[0]
                          setAssignment(day, e.target.value || null, opt?.text ?? '')
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
                      >
                        <option value="">{t('mealPlan.noRecipe')}</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.doc.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        disabled={!byDay[day]?.recipeId}
                        aria-label={t('mealPlan.dayPeopleAriaLabel', {
                          day: t(`mealPlan.days.${day}`),
                        })}
                        value={byDay[day]?.persons ?? ''}
                        onChange={(e) => setDayPeople(day, e.target.value)}
                        className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-foreground disabled:opacity-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
