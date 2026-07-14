import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MealPlanWeekAssignments } from '@/components/meal-plan/MealPlanWeekAssignments'
import { DAYS } from '@/components/meal-plan/constants'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { getLocalMealPlan, getSyncMeta, listLocalRecipes } from '@/local/db'
import { saveMealPlan } from '@/local/mutations'
import {
  FAMILY_DEFAULT_PERSONS_KEY,
  pullFamilyMealPlanDefaults,
  pullMealPlan,
  pullRecipes,
} from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import { formatLoadErrorMessage, mapAsyncCatchError } from '@/lib/loadErrors'
import { Input } from '@/components/ui/input'
import { getNextWeekId } from '@/lib/utils'
import type { MealPlanDoc, DayAssignment, Recipe } from '@/types'

function parsePositiveInt(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

/** Normalized fingerprint of what a save would persist, for dirty checking. */
function planFingerprint(doc: MealPlanDoc): string {
  return JSON.stringify({
    week: doc.weekIdentifier,
    defaultPersons: doc.defaultPersons ?? null,
    assignments: doc.assignments
      .filter((a) => a.recipeId)
      .slice()
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((a) => ({ day: a.day, recipeId: a.recipeId, persons: a.persons ?? null })),
  })
}

export default function MealPlan() {
  const { t, i18n } = useTranslation()
  const [weekId, setWeekId] = useState(getNextWeekId)
  const [plan, setPlan] = useState<MealPlanDoc | null>(null)
  const [savedPlan, setSavedPlan] = useState<MealPlanDoc | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, loading: localLoading } = useLocal(
    async () => {
      const [planData, recipesData, familyDefault] = await Promise.all([
        getLocalMealPlan(weekId),
        listLocalRecipes(),
        getSyncMeta<number | null>(FAMILY_DEFAULT_PERSONS_KEY),
      ])
      if (!planData) return null
      let merged = planData
      if (merged.defaultPersons == null && familyDefault != null) {
        merged = { ...merged, defaultPersons: familyDefault }
      }
      return { plan: merged, recipes: recipesData ?? [] }
    },
    ['mealPlans', 'recipes', 'syncMeta'],
    [weekId],
  )
  const { error: pullError } = useBackgroundPull(
    async () => {
      await Promise.all([
        pullMealPlan(weekId),
        pullRecipes(),
        pullFamilyMealPlanDefaults(),
      ])
    },
    [weekId],
  )
  // With nothing local yet, stay in loading until the pull lands in the
  // store (or fails); with local data, pull errors are irrelevant offline noise.
  const loading = localLoading || (data == null && pullError == null)
  const loadError = data == null ? pullError : null

  useEffect(() => {
    setPlan(null)
    setSavedPlan(null)
    setJustSaved(false)
  }, [weekId])

  useEffect(() => {
    if (!data) return
    setRecipes(data.recipes)
    // Background store updates must never clobber unsaved edits; adopt the
    // incoming plan only while the editor is clean (or not yet initialized).
    const hasUnsavedEdits =
      plan != null && savedPlan != null && planFingerprint(plan) !== planFingerprint(savedPlan)
    if (hasUnsavedEdits) return
    setPlan(data.plan)
    setSavedPlan(data.plan)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per store snapshot; plan/savedPlan only guard adoption
  }, [data])

  const assignments = plan?.assignments ?? []
  const byDay = Object.fromEntries(assignments.map((a) => [a.day, a]))
  const dirty =
    plan != null && savedPlan != null && planFingerprint(plan) !== planFingerprint(savedPlan)

  useEffect(() => {
    if (dirty) setJustSaved(false)
  }, [dirty])

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

  /** Swaps the recipes of two days; per-day people overrides stay with their day. */
  const swapDays = (dayA: string, dayB: string) => {
    if (!plan || dayA === dayB) return
    const sourceFor = (d: string) =>
      d === dayA ? byDay[dayB] : d === dayB ? byDay[dayA] : byDay[d]
    const next: DayAssignment[] = DAYS.flatMap((d) => {
      const source = sourceFor(d)
      if (!source?.recipeId) return []
      return [
        {
          day: d,
          recipeId: source.recipeId,
          recipeName: source.recipeName,
          persons: byDay[d]?.persons ?? null,
        },
      ]
    })
    setPlan({ ...plan, assignments: next })
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
      // Offline-first: apply to the local store and queue the server PUT (with
      // a day-level merge on sync). Succeeds offline; nothing awaits the network.
      await saveMealPlan(weekId, plan)
      setSavedPlan(plan)
      setJustSaved(true)
    } catch (e) {
      setError(mapAsyncCatchError(e))
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
      ) : loadError ? (
        <p className="text-destructive">{formatLoadErrorMessage(loadError, t)}</p>
      ) : (
        <>
          <MealPlanWeekAssignments
            byDay={byDay}
            recipes={recipes}
            defaultPersons={plan?.defaultPersons ?? null}
            setAssignment={setAssignment}
            setDayPeople={setDayPeople}
            onSwapDays={swapDays}
          />
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <label
              htmlFor="meal-plan-default-people"
              className="text-sm text-muted-foreground"
            >
              {t('mealPlan.defaultPeople')}
            </label>
            <Input
              id="meal-plan-default-people"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={plan?.defaultPersons ?? ''}
              onChange={(e) => setDefaultPeople(e.target.value)}
              className="h-8 w-20"
            />
            <p className="w-full text-xs text-muted-foreground">
              {t('mealPlan.defaultPeopleHint')}
            </p>
          </div>
          <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-border bg-background/90 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            {error != null && (
              <p className="mb-2 text-sm text-destructive">
                {formatLoadErrorMessage(error, t)}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <span className="text-sm text-muted-foreground" role="status">
                {dirty
                  ? t('mealPlan.unsavedChanges')
                  : justSaved
                    ? t('mealPlan.savedIndicator')
                    : ''}
              </span>
              <Button
                onClick={save}
                disabled={saving || !dirty}
                className="flex-1 sm:flex-none"
              >
                {saving ? t('mealPlan.saving') : t('mealPlan.savePlan')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
