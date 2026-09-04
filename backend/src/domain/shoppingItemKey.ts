import { normalizeIngredientName } from "./ingredientCategories.js";
import { normalizeUnit } from "./unitConversion.js";
import type { ItemSource, ShoppingTrip } from "./types.js";

/** True when a quantity string parses as a finite number (matches the aggregator). */
export function isNumericQuantity(quantity: string): boolean {
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
export function shoppingItemKey(item: { name: string; quantity: string; unit: string }): string {
  const name = normalizeIngredientName(item.name);
  const known = normalizeUnit(item.unit);
  if (known && isNumericQuantity(item.quantity)) {
    return `${name}|${known.family}`;
  }
  return `${name}|${item.unit.trim().toLowerCase()}`;
}

/** Key of one bought contribution: an item identity on a given planned day + recipe. */
export function boughtSourceKey(itemKey: string, source: ItemSource): string {
  return `${itemKey}\u0000${source.day}\u0000${source.recipeId}`;
}

/**
 * Everything the week's completed trips have already bought, as the set of
 * (item, day, recipe) contributions the aggregator must leave out. A recipe
 * bought for Monday stays bought even when Wednesday later needs the same
 * ingredient (only Wednesday's share reappears), and swapping Monday's recipe
 * after the trip brings the new recipe's ingredients back onto the open list.
 */
export function boughtSourceKeys(trips: readonly ShoppingTrip[] | undefined): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const trip of trips ?? []) {
    for (const item of trip.items) {
      if (item.manual || !item.sources) continue;
      const key = shoppingItemKey(item);
      for (const source of item.sources) keys.add(boughtSourceKey(key, source));
    }
  }
  return keys;
}
