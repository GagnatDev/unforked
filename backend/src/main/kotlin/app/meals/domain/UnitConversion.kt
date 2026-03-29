package app.meals.domain

/**
 * Unit families for shopping-list aggregation. Quantities in a family are converted to a base unit
 * (ml for volume, g for weight), summed, then formatted with [bestDisplayUnit].
 */
enum class UnitFamily {
    VOLUME,
    WEIGHT,
}

/**
 * @param family volume or weight family
 * @param toBase multiplier from this unit to base (ml or g)
 * @param canonical short label for the unit (for documentation; display uses [bestDisplayUnit])
 */
data class KnownUnit(
    val family: UnitFamily,
    val toBase: Double,
    val canonical: String,
)

private val knownByAlias: Map<String, KnownUnit> = buildMap {
    fun putAllAliases(vararg aliases: String, unit: KnownUnit) {
        for (a in aliases) {
            put(a.lowercase(), unit)
        }
    }

    val g = KnownUnit(UnitFamily.WEIGHT, 1.0, "g")
    putAllAliases("g", "gram", "grams", unit = g)

    val hg = KnownUnit(UnitFamily.WEIGHT, 100.0, "hg")
    putAllAliases("hg", "hektogram", "hectogram", "hektograms", "hectograms", unit = hg)

    val kg = KnownUnit(UnitFamily.WEIGHT, 1000.0, "kg")
    putAllAliases("kg", "kilo", "kilogram", "kilograms", unit = kg)

    val tsp = KnownUnit(UnitFamily.VOLUME, 5.0, "tsp")
    putAllAliases(
        "tsp",
        "ts",
        "teskje",
        "teaspoon",
        "teaspoons",
        unit = tsp,
    )

    val tbsp = KnownUnit(UnitFamily.VOLUME, 15.0, "tbsp")
    putAllAliases(
        "tbsp",
        "ss",
        "spiseskje",
        "tablespoon",
        "tablespoons",
        unit = tbsp,
    )

    val ml = KnownUnit(UnitFamily.VOLUME, 1.0, "ml")
    putAllAliases("ml", "milliliter", "milliliters", "millilitre", "millilitres", unit = ml)

    val cl = KnownUnit(UnitFamily.VOLUME, 10.0, "cl")
    putAllAliases("cl", "centiliter", "centiliters", "centilitre", "centilitres", unit = cl)

    val dl = KnownUnit(UnitFamily.VOLUME, 100.0, "dl")
    putAllAliases("dl", "desiliter", "deciliter", "deciliters", "decilitre", "decilitres", unit = dl)

    val l = KnownUnit(UnitFamily.VOLUME, 1000.0, "l")
    putAllAliases("l", "liter", "liters", "litre", "litres", unit = l)
}

/**
 * Returns [KnownUnit] when [unit] is exactly a known alias (trimmed, case-insensitive).
 * Compound strings like "g can" return null.
 */
fun normalizeUnit(unit: String): KnownUnit? {
    val key = unit.trim().lowercase()
    if (key.isEmpty()) return null
    return knownByAlias[key]
}

/**
 * Picks the largest unit where the displayed value is >= 1.
 * [baseValue] is in ml (volume) or g (weight).
 */
fun bestDisplayUnit(baseValue: Double, family: UnitFamily): Pair<Double, String> =
    when (family) {
        UnitFamily.WEIGHT ->
            if (baseValue >= 1000.0) {
                baseValue / 1000.0 to "kg"
            } else {
                baseValue to "g"
            }
        UnitFamily.VOLUME ->
            when {
                baseValue >= 1000.0 -> baseValue / 1000.0 to "l"
                baseValue >= 100.0 -> baseValue / 100.0 to "dl"
                else -> baseValue to "ml"
            }
    }
