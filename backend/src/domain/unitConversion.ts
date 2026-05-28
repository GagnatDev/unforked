// Unit families for shopping-list aggregation. Quantities in a family are
// converted to a base unit (ml for volume, g for weight), summed, then formatted
// with bestDisplayUnit. Ported from the Kotlin UnitConversion.

export type UnitFamily = "volume" | "weight";

export interface KnownUnit {
  family: UnitFamily;
  /** Multiplier from this unit to the base (ml or g). */
  toBase: number;
  canonical: string;
}

const knownByAlias = new Map<string, KnownUnit>();

function register(unit: KnownUnit, ...aliases: string[]): void {
  for (const alias of aliases) knownByAlias.set(alias.toLowerCase(), unit);
}

register({ family: "weight", toBase: 1, canonical: "g" }, "g", "gram", "grams");
register(
  { family: "weight", toBase: 100, canonical: "hg" },
  "hg",
  "hektogram",
  "hectogram",
  "hektograms",
  "hectograms",
);
register({ family: "weight", toBase: 1000, canonical: "kg" }, "kg", "kilo", "kilogram", "kilograms");
register({ family: "volume", toBase: 5, canonical: "tsp" }, "tsp", "ts", "teskje", "teaspoon", "teaspoons");
register(
  { family: "volume", toBase: 15, canonical: "tbsp" },
  "tbsp",
  "ss",
  "spiseskje",
  "tablespoon",
  "tablespoons",
);
register(
  { family: "volume", toBase: 1, canonical: "ml" },
  "ml",
  "milliliter",
  "milliliters",
  "millilitre",
  "millilitres",
);
register(
  { family: "volume", toBase: 10, canonical: "cl" },
  "cl",
  "centiliter",
  "centiliters",
  "centilitre",
  "centilitres",
);
register(
  { family: "volume", toBase: 100, canonical: "dl" },
  "dl",
  "desiliter",
  "deciliter",
  "deciliters",
  "decilitre",
  "decilitres",
);
register({ family: "volume", toBase: 1000, canonical: "l" }, "l", "liter", "liters", "litre", "litres");

/**
 * Returns a KnownUnit when `unit` is exactly a known alias (trimmed,
 * case-insensitive). Compound strings like "g can" return null.
 */
export function normalizeUnit(unit: string): KnownUnit | null {
  const key = unit.trim().toLowerCase();
  if (!key) return null;
  return knownByAlias.get(key) ?? null;
}

/** Pick the largest unit where the displayed value is >= 1. */
export function bestDisplayUnit(baseValue: number, family: UnitFamily): [number, string] {
  if (family === "weight") {
    return baseValue >= 1000 ? [baseValue / 1000, "kg"] : [baseValue, "g"];
  }
  if (baseValue >= 1000) return [baseValue / 1000, "l"];
  if (baseValue >= 100) return [baseValue / 100, "dl"];
  return [baseValue, "ml"];
}
