import type {
  DayAssignment,
  MealPlanDoc,
  RecipeDoc,
  ShoppingListItem,
} from "../domain/types.js";
import { bestDisplayUnit, normalizeUnit, type UnitFamily } from "../domain/unitConversion.js";

export interface RecipeEntry {
  id: string;
  doc: RecipeDoc;
}

type Contribution =
  | { kind: "inFamily"; baseAmount: number; recipeId: string }
  | { kind: "raw"; quantity: string; recipeId: string };

/**
 * Aggregate ingredients across meal-plan assignments. Same-name ingredients merge
 * by unit family (volume/weight) when the quantity is numeric; otherwise they stay
 * grouped by their raw unit. Ported from the Kotlin ShoppingListService.
 */
export function buildAggregatedShoppingItems(
  plan: MealPlanDoc,
  recipeById: Map<string, RecipeEntry>,
): ShoppingListItem[] {
  const aggregated = new Map<string, Contribution[]>();

  for (const assignment of plan.assignments) {
    const entry = recipeById.get(assignment.recipeId);
    if (!entry) continue;
    const scale = scaleForAssignment(plan, assignment, entry.doc);

    for (const ing of entry.doc.ingredients) {
      const name = ing.name.toLowerCase().trim();
      const known = normalizeUnit(ing.unit);
      const scaledQty = scaledIngredientQuantity(ing.quantity, scale);
      const parsed = parseQuantity(scaledQty);
      const key = known && parsed !== null ? `${name}|${known.family}` : `${name}|${ing.unit}`;

      let list = aggregated.get(key);
      if (!list) {
        list = [];
        aggregated.set(key, list);
      }
      if (known && parsed !== null) {
        list.push({ kind: "inFamily", baseAmount: parsed * known.toBase, recipeId: entry.id });
      } else {
        list.push({ kind: "raw", quantity: scaledQty, recipeId: entry.id });
      }
    }
  }

  const items: ShoppingListItem[] = [];
  for (const [key, contribs] of aggregated) {
    const sep = key.indexOf("|");
    const nameLower = key.slice(0, sep);
    const second = key.slice(sep + 1);
    const displayName = nameLower.charAt(0).toUpperCase() + nameLower.slice(1);
    const recipeIds = [...new Set(contribs.map((c) => c.recipeId))];

    if (second === "volume" || second === "weight") {
      const sum = contribs.reduce((acc, c) => (c.kind === "inFamily" ? acc + c.baseAmount : acc), 0);
      const [displayVal, unit] = bestDisplayUnit(sum, second as UnitFamily);
      items.push({ name: displayName, quantity: formatQuantity(displayVal), unit, recipeIds });
    } else {
      const quantities = contribs
        .filter((c): c is Extract<Contribution, { kind: "raw" }> => c.kind === "raw")
        .map((c) => c.quantity)
        .filter((q) => q.trim() !== "");
      items.push({ name: displayName, quantity: summarizeQuantities(quantities), unit: second, recipeIds });
    }
  }
  return items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Scale factor for an assignment: effective persons ÷ recipe servings (default 1). */
export function scaleForAssignment(
  plan: MealPlanDoc,
  assignment: DayAssignment,
  doc: RecipeDoc,
): number {
  const effective = assignment.persons ?? plan.defaultPersons;
  if (effective == null) return 1;
  const servings = Math.max(doc.servings, 1);
  return effective / servings;
}

/**
 * Scale a recipe line quantity. Numeric strings are multiplied; non-numeric ones
 * use ceil(scale) as a discrete count prefix (e.g. "2× pinch").
 */
export function scaledIngredientQuantity(rawQuantity: string, scale: number): string {
  const q = rawQuantity.trim();
  if (!q) return q;
  const parsed = parseQuantity(q);
  if (parsed !== null) return formatQuantity(parsed * scale);
  const n = Math.max(Math.ceil(scale), 1);
  return n === 1 ? q : `${n}× ${q}`;
}

/**
 * Sum quantities when all parse as numbers; otherwise join distinct strings with
 * ", ". Returns "—" for an empty list.
 */
export function summarizeQuantities(quantities: string[]): string {
  if (quantities.length === 0) return "—";
  const parsed = quantities.map(parseQuantity).filter((n): n is number => n !== null);
  if (parsed.length === quantities.length) {
    return formatQuantity(parsed.reduce((a, b) => a + b, 0));
  }
  return [...new Set(quantities)].join(", ");
}

function parseQuantity(s: string): number | null {
  const cleaned = s.trim().replace(/,/g, ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatQuantity(value: number): string {
  if (value === Math.trunc(value)) return String(Math.trunc(value));
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
