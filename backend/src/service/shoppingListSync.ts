import { randomUUID } from "node:crypto";
import { categorizeIngredient, normalizeIngredientName } from "../domain/ingredientCategories.js";
import type {
  PersistedShoppingListDoc,
  ShoppingCategory,
  ShoppingListEntry,
  ShoppingListItem,
} from "../domain/types.js";
import { normalizeUnit } from "../domain/unitConversion.js";

/**
 * Identity of an aggregated item across syncs. Uses the unit *family* for known
 * units so a display flip (700 g -> 1.05 kg) still matches the same entry; the
 * aggregator can emit same-name items in different unit groups, so name alone
 * is not enough.
 */
function matchKey(item: ShoppingListItem): string {
  const family = normalizeUnit(item.unit)?.family ?? item.unit.trim().toLowerCase();
  return `${normalizeIngredientName(item.name)}|${family}`;
}

/**
 * Reconcile the persisted shopping list with a freshly aggregated one from the
 * current meal plan. Checked state and category assignments survive for items
 * still in the plan; items whose recipes left the plan are dropped (even when
 * checked — they would otherwise linger forever); manual items are always kept.
 */
export function syncShoppingListDoc(
  previous: PersistedShoppingListDoc | undefined,
  aggregate: ShoppingListItem[],
  overrides: ReadonlyMap<string, ShoppingCategory>,
  weekIdentifier: string,
): PersistedShoppingListDoc {
  const previousRecipeItems = new Map<string, ShoppingListEntry>();
  const manualItems: ShoppingListEntry[] = [];
  for (const entry of previous?.items ?? []) {
    if (entry.manual) {
      manualItems.push(entry);
    } else if (!previousRecipeItems.has(matchKey(entry))) {
      previousRecipeItems.set(matchKey(entry), entry);
    }
  }

  const items: ShoppingListEntry[] = aggregate.map((item) => {
    const existing = previousRecipeItems.get(matchKey(item));
    if (existing) {
      return { ...item, id: existing.id, category: existing.category, checked: existing.checked, manual: false };
    }
    return {
      ...item,
      id: randomUUID(),
      category: categorizeIngredient(item.name, overrides),
      checked: false,
      manual: false,
    };
  });

  return { weekIdentifier, items: [...items, ...manualItems] };
}

/** Build a manual (user-added) entry, auto-categorized unless one is given. */
export function createManualEntry(
  input: { name: string; quantity: string; unit: string; category?: ShoppingCategory },
  overrides: ReadonlyMap<string, ShoppingCategory>,
): ShoppingListEntry {
  return {
    id: randomUUID(),
    name: input.name,
    quantity: input.quantity,
    unit: input.unit,
    recipeIds: [],
    category: input.category ?? categorizeIngredient(input.name, overrides),
    checked: false,
    manual: true,
  };
}
