import { randomUUID } from "node:crypto";
import { categorizeIngredient, normalizeIngredientName } from "../domain/ingredientCategories.js";
import type {
  PersistedShoppingListDoc,
  ShoppingCategory,
  ShoppingListEntry,
  ShoppingListItem,
} from "../domain/types.js";
import { normalizeUnit } from "../domain/unitConversion.js";

/** True when a quantity string parses as a finite number (matches the aggregator). */
function isNumericQuantity(quantity: string): boolean {
  const cleaned = quantity.trim().replace(/,/g, ".");
  return cleaned !== "" && Number.isFinite(Number(cleaned));
}

/**
 * Identity of an aggregated item across syncs. Mirrors the aggregator's grouping
 * key exactly: a known unit collapses to its *family* only when the quantity is
 * numeric (so a display flip 700 g -> 1.05 kg still matches the same entry),
 * otherwise the raw unit is used. Grouping purely by family would collide a
 * numeric "pepper 2.5 ml" (family volume) with a non-numeric "pepper — ts"
 * (also family volume) even though the aggregator emits them as two rows,
 * assigning both the same id and making them toggle and render as one.
 */
function matchKey(item: ShoppingListItem): string {
  const name = normalizeIngredientName(item.name);
  const known = normalizeUnit(item.unit);
  if (known && isNumericQuantity(item.quantity)) {
    return `${name}|${known.family}`;
  }
  return `${name}|${item.unit.trim().toLowerCase()}`;
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

  return { weekIdentifier, items: [...items, ...manualItems], ...statusFields(previous) };
}

/**
 * The approved / "shopping now" fields carried verbatim across a sync (design
 * #104 D4): regenerating items from the meal plan must never drop or alter the
 * trip state. Fields are copied only when present so a legacy doc (or an open
 * list) stays byte-identical to its pre-sync shape.
 */
function statusFields(
  previous: PersistedShoppingListDoc | undefined,
): Partial<PersistedShoppingListDoc> {
  if (!previous) return {};
  const copied: Partial<PersistedShoppingListDoc> = {};
  if (previous.status !== undefined) copied.status = previous.status;
  if (previous.approvedBy !== undefined) copied.approvedBy = previous.approvedBy;
  if (previous.approvedByEmail !== undefined) copied.approvedByEmail = previous.approvedByEmail;
  if (previous.approvedAt !== undefined) copied.approvedAt = previous.approvedAt;
  return copied;
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
