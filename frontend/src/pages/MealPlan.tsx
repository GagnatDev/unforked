import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MealPlanPeopleSelect } from '@/components/meal-plan/MealPlanPeopleSelect'
import { MealPlanWeekAssignments } from '@/components/meal-plan/MealPlanWeekAssignments'
import { DAYS } from '@/components/meal-plan/constants'
import { WeekPicker } from '@/components/WeekPicker'
import { useLocale } from '@/hooks/useLocale'
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
import { cn, getNextWeekId } from '@/lib/utils'
import type { MealPlanDoc, DayAssignment, Recipe } from '@/types'

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
  const { t } = useTranslation()
  const locale = useLocale()
  const [weekId, setWeekId] = useState(getNextWeekId)
  const [plan, setPlan] = useState<MealPlanDoc | null>(null)
  const [savedPlan, setSavedPlan] = useState<MealPlanDoc | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Ticket of the most recently started save; older ones are ignored. */
  const saveSeq = useRef(0)

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
    // Abandon any in-flight save: its doc belongs to the week we just left.
    saveSeq.current++
    setSaving(false)
    setError(null)
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

  /**
   * Show an edit and persist it in one step — every change to the plan is a
   * save, so there is no button to press and nothing to lose by navigating
   * away. Saves are cheap and always ordered: the newest one owns the outcome,
   * so a slower earlier save can never report over it or restore its doc.
   */
  const applyAndSave = (doc: MealPlanDoc) => {
    setPlan(doc)
    const seq = ++saveSeq.current
    setSaving(true)
    setError(null)
    // Offline-first: apply to the local store and queue the server PUT (with
    // a day-level merge on sync). Succeeds offline; nothing awaits the network.
    void saveMealPlan(weekId, doc).then(
      () => {
        if (seq !== saveSeq.current) return
        setSavedPlan(doc)
        setJustSaved(true)
        setSaving(false)
      },
      (e) => {
        if (seq !== saveSeq.current) return
        setError(mapAsyncCatchError(e))
        setSaving(false)
      },
    )
  }

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
    applyAndSave(doc)
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
    applyAndSave({ ...plan, assignments: next })
  }

  const setDefaultPeople = (persons: number | null) => {
    if (!plan) return
    applyAndSave({
      ...plan,
      defaultPersons: persons,
    })
  }

  const setDayPeople = (day: string, persons: number | null) => {
    if (!plan) return
    const assignment = byDay[day]
    if (!assignment?.recipeId) return
    applyAndSave({
      ...plan,
      assignments: plan.assignments.map((a) =>
        a.day === day ? { ...a, persons } : a
      ),
    })
  }

  return (
    <div>
      <h1>{t('mealPlan.title')}</h1>
      <div className="mb-4">
        <WeekPicker value={weekId} onChange={setWeekId} locale={locale} />
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
            {/* A plain span, not a <label>: the dropdown trigger is a button,
                which `for=` cannot label — it carries the same text as its
                aria-label instead. */}
            <span className="text-sm text-muted-foreground">
              {t('mealPlan.defaultPeople')}
            </span>
            <MealPlanPeopleSelect
              id="meal-plan-default-people"
              value={plan?.defaultPersons ?? null}
              onValueChange={setDefaultPeople}
              ariaLabel={t('mealPlan.defaultPeople')}
              emptyLabel={t('mealPlan.peopleUnset')}
              className="h-8 w-28"
            />
            <p className="w-full text-xs text-muted-foreground">
              {t('mealPlan.defaultPeopleHint')}
            </p>
          </div>
          {/* Edits save themselves; this line is the only save feedback. */}
          <p
            role="status"
            className={cn(
              'mt-4 min-h-5 text-sm',
              error != null ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {error != null
              ? formatLoadErrorMessage(error, t)
              : saving
                ? t('mealPlan.saving')
                : justSaved
                  ? t('mealPlan.savedIndicator')
                  : ''}
          </p>
        </>
      )}
    </div>
  )
}
