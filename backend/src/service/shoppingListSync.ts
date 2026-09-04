import { randomUUID } from "node:crypto";
import { categorizeIngredient } from "../domain/ingredientCategories.js";
import { shoppingItemKey as matchKey } from "../domain/shoppingItemKey.js";
import type {
  PersistedShoppingListDoc,
  ShoppingCategory,
  ShoppingListEntry,
  ShoppingListItem,
} from "../domain/types.js";

/**
 * Reconcile the persisted shopping list with a freshly aggregated one from the
 * current meal plan. Checked state and category assignments survive for items
 * still in the plan; items whose recipes left the plan are dropped (even when
 * checked — they would otherwise linger forever); manual items are always kept.
 * The aggregate is expected to already exclude what the week's completed trips
 * bought (`boughtSourceKeys`), so what comes out is the *open* list.
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

  return { weekIdentifier, items: [...items, ...manualItems], ...carriedFields(previous) };
}

/**
 * The fields carried verbatim across a sync: the approved / ready state
 * (design #104 D4) and the completed trips. Regenerating items from the meal
 * plan must never drop or alter the trip state or the shopping history. Fields
 * are copied only when present so a legacy doc (or an open list with no trips)
 * stays byte-identical to its pre-sync shape.
 */
function carriedFields(
  previous: PersistedShoppingListDoc | undefined,
): Partial<PersistedShoppingListDoc> {
  if (!previous) return {};
  const copied: Partial<PersistedShoppingListDoc> = {};
  if (previous.status !== undefined) copied.status = previous.status;
  if (previous.approvedBy !== undefined) copied.approvedBy = previous.approvedBy;
  if (previous.approvedByEmail !== undefined) copied.approvedByEmail = previous.approvedByEmail;
  if (previous.approvedAt !== undefined) copied.approvedAt = previous.approvedAt;
  if (previous.readyBy !== undefined) copied.readyBy = previous.readyBy;
  if (previous.readyByEmail !== undefined) copied.readyByEmail = previous.readyByEmail;
  if (previous.readyAt !== undefined) copied.readyAt = previous.readyAt;
  if (previous.trips !== undefined) copied.trips = previous.trips;
  return copied;
}

/**
 * Clear every status field so the doc reads as open (absent = open,
 * back-compat). Mutates in place; used by reopen and trip completion.
 */
export function clearStatusFields(doc: PersistedShoppingListDoc): void {
  delete doc.status;
  delete doc.approvedBy;
  delete doc.approvedByEmail;
  delete doc.approvedAt;
  delete doc.readyBy;
  delete doc.readyByEmail;
  delete doc.readyAt;
}

/**
 * Build a manual (user-added) entry, auto-categorized unless one is given.
 * An `id` may be supplied (a client-minted UUID for offline-first adds); the
 * server otherwise mints one. The category is always (re)computed server-side
 * unless explicitly provided, so an offline client's local heuristic guess is
 * corrected on sync (offline-first resolved decision 3).
 */
export function createManualEntry(
  input: { id?: string; name: string; quantity: string; unit: string; category?: ShoppingCategory },
  overrides: ReadonlyMap<string, ShoppingCategory>,
): ShoppingListEntry {
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    quantity: input.quantity,
    unit: input.unit,
    recipeIds: [],
    category: input.category ?? categorizeIngredient(input.name, overrides),
    checked: false,
    manual: true,
  };
}
