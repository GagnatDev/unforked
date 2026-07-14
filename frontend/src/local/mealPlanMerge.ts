import type { DayAssignment, MealPlanDoc } from '@/types'

/**
 * Day-level meal-plan merge (offline-first spec A5 / resolved decision 2).
 *
 * A meal plan is persisted as a whole document, so a naive re-PUT of our
 * offline edits would clobber a co-editor's changes to *other* days. Instead,
 * on sync we re-apply only the days *we* changed onto the server's current doc:
 *
 *   - `base`  — the plan as it was when our edit started (last seen from server).
 *   - `ours`  — the plan after our offline edit.
 *   - `server`— the server's current plan at sync time.
 *
 * For each day, if our edit changed it (added / removed / modified relative to
 * `base`), our version wins; otherwise the server's version is kept. The same
 * disjoint-change rule applies to the doc-level `defaultPersons`. This is run
 * unconditionally before every re-PUT (there is no `409` yet — that precondition
 * machinery lands in phase 4), which keeps different-day edits from two devices
 * from clobbering each other even under the current last-write-wins backend.
 */

function assignmentsByDay(doc: MealPlanDoc): Map<string, DayAssignment> {
  const byDay = new Map<string, DayAssignment>()
  for (const a of doc.assignments) {
    if (a.recipeId) byDay.set(a.day, a)
  }
  return byDay
}

/** Two assignments are equal when day, recipe and per-day people all match. */
function sameAssignment(a: DayAssignment | undefined, b: DayAssignment | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.recipeId === b.recipeId &&
    a.recipeName === b.recipeName &&
    (a.persons ?? null) === (b.persons ?? null)
  )
}

/**
 * Merge our changed days onto the server's current doc. `weekIdentifier` is
 * forced to `weekId` so the result always matches the route's week.
 */
export function mergeMealPlan(
  base: MealPlanDoc,
  ours: MealPlanDoc,
  server: MealPlanDoc,
  weekId: string,
): MealPlanDoc {
  const baseByDay = assignmentsByDay(base)
  const oursByDay = assignmentsByDay(ours)
  const serverByDay = assignmentsByDay(server)

  const days = new Set<string>([...baseByDay.keys(), ...oursByDay.keys(), ...serverByDay.keys()])

  const merged: DayAssignment[] = []
  for (const day of days) {
    const oursDay = oursByDay.get(day)
    const weChangedThisDay = !sameAssignment(baseByDay.get(day), oursDay)
    const chosen = weChangedThisDay ? oursDay : serverByDay.get(day)
    if (chosen?.recipeId) merged.push(chosen)
  }

  const weChangedDefault = (base.defaultPersons ?? null) !== (ours.defaultPersons ?? null)
  const defaultPersons = weChangedDefault ? ours.defaultPersons ?? null : server.defaultPersons ?? null

  return { weekIdentifier: weekId, defaultPersons, assignments: merged }
}
