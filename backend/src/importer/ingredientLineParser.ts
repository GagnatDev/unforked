import type { Ingredient } from "../domain/types.js";
import { normalizeUnit } from "../domain/unitConversion.js";

/**
 * Best-effort split of imported recipe lines (e.g. JSON-LD recipeIngredient) into
 * quantity, unit, and name. Approximate qualifiers (e.g. "ca.") are kept on the
 * name so the numeric quantity stays plain for scaling/shopping math.
 * Ported from the Kotlin IngredientLineParser.
 */
const LINE_PATTERN =
  /^\s*(?:(ca\.?|cirka|omtrent|approx\.?|~)\s+)?(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$/i;

/** Count / pack units not in normalizeUnit but common in Norwegian recipes. */
const COUNT_UNITS = new Map<string, string>([
  ["stk", "stk"],
  ["st", "stk"],
  ["pcs", "stk"],
  ["pc", "stk"],
  ["piece", "stk"],
  ["pieces", "stk"],
]);

export function parseLine(raw: string): Ingredient {
  const trimmed = raw.trim();
  if (!trimmed) return { name: "", quantity: "", unit: "" };

  const match = LINE_PATTERN.exec(trimmed);
  if (!match) return { name: trimmed, quantity: "", unit: "" };

  const approxRaw = match[1] ?? "";
  const quantity = match[2];
  const unitToken = match[3];
  const nameRest = match[4];

  const nameTrimmed = nameRest.trim();
  if (!nameTrimmed) return { name: trimmed, quantity: "", unit: "" };

  const unitKey = normalizeUnitToken(unitToken);
  let unitOut: string;
  if (normalizeUnit(unitKey)) {
    unitOut = unitKey;
  } else if (COUNT_UNITS.has(unitKey)) {
    unitOut = COUNT_UNITS.get(unitKey) as string;
  } else {
    return { name: trimmed, quantity: "", unit: "" };
  }

  const approx = approxRaw.trim();
  const name = approx ? `${approx} ${nameTrimmed}`.trim() : nameTrimmed;
  return { name, quantity: quantity.trim(), unit: unitOut };
}

function normalizeUnitToken(token: string): string {
  return token.trim().toLowerCase().replace(/\.+$/, "");
}
