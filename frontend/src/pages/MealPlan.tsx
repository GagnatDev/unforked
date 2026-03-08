import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getCurrentWeekId } from '@/lib/utils'
import { api } from '../api'
import type { MealPlanDoc, DayAssignment, Recipe } from '../types'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function getInitialWeekId(): string {
  return getCurrentWeekId()
}

export default function MealPlan() {
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
    const next: DayAssignment[] = DAYS.map((d) => {
      if (d !== day) return byDay[d] ?? { day: d, recipeId: '', recipeName: '' }
      if (!recipeId) return { day, recipeId: '', recipeName: '' }
      return { day, recipeId, recipeName }
    }).filter((a) => a.recipeId)
    const doc: MealPlanDoc = { weekIdentifier: weekId, assignments: next }
    setPlan(doc)
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

  if (loading) return <p>Loading…</p>
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>

  return (
    <div>
      <h1>This week&apos;s dinners</h1>
      <p>
        <label>
          Week{' '}
          <input
            type="text"
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            placeholder="e.g. 2025-W10"
            style={{ padding: 8 }}
          />
        </label>
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: 12 }}>Day</th>
            <th style={{ textAlign: 'left', padding: 12 }}>Recipe</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => (
            <tr key={day} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 12, textTransform: 'capitalize' }}>{day}</td>
              <td style={{ padding: 12 }}>
                <select
                  value={byDay[day]?.recipeId ?? ''}
                  onChange={(e) => {
                    const opt = e.target.selectedOptions[0]
                    setAssignment(day, e.target.value || null, opt?.text ?? '')
                  }}
                  style={{ width: '100%', padding: 8 }}
                >
                  <option value="">—</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.doc.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save plan'}
        </Button>
      </p>
    </div>
  )
}
