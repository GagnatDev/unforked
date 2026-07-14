import type { RecipeDoc } from '@/types'

/**
 * Field-level recipe merge (offline-first spec A5 — "field-level merge if
 * disjoint"). Recipes are rarely co-edited, so a coarse whole-doc re-PUT on a
 * `409` would needlessly clobber a field a co-editor changed. Instead, for each
 * field we keep *our* value only when we actually changed it (relative to the
 * base we started from); otherwise we take the server's current value.
 *
 *   - `base`   — the recipe as it was when our edit started (last seen).
 *   - `ours`   — the recipe after our offline edit.
 *   - `server` — the server's current recipe at conflict time.
 *
 * Disjoint edits (we renamed, they re-tagged) both survive; a true same-field
 * conflict resolves last-writer-wins in our favour, which is acceptable for a
 * family recipe box.
 */

const FIELDS: (keyof RecipeDoc)[] = [
  'name',
  'description',
  'sourceUrl',
  'sourceName',
  'ingredients',
  'steps',
  'servings',
  'tags',
]

function changed<K extends keyof RecipeDoc>(a: RecipeDoc, b: RecipeDoc, key: K): boolean {
  return JSON.stringify(a[key]) !== JSON.stringify(b[key])
}

export function mergeRecipe(base: RecipeDoc, ours: RecipeDoc, server: RecipeDoc): RecipeDoc {
  const merged = { ...server }
  for (const field of FIELDS) {
    if (changed(base, ours, field)) {
      // We changed this field — our value wins over the server's.
      ;(merged[field] as RecipeDoc[typeof field]) = ours[field]
    }
  }
  return merged
}
