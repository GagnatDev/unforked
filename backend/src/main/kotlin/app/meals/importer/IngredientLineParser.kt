package app.meals.importer

import app.meals.domain.Ingredient
import app.meals.domain.normalizeUnit

/**
 * Best-effort split of imported recipe lines (e.g. JSON-LD [recipeIngredient]) into
 * [Ingredient.quantity], [Ingredient.unit], and [Ingredient.name].
 *
 * Approximate qualifiers (e.g. "ca.") are kept on the **name** so the numeric quantity stays a plain number
 * for scaling and shopping-list math.
 */
object IngredientLineParser {
    private val linePattern = Regex(
        """^\s*(?:(ca\.?|cirka|omtrent|approx\.?|~)\s+)?(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$""",
        RegexOption.IGNORE_CASE,
    )

    /** Count / pack units not in [normalizeUnit] but common in Norwegian recipes. */
    private val countUnitCanonicalByNormalized: Map<String, String> = mapOf(
        "stk" to "stk",
        "st" to "stk",
        "pcs" to "stk",
        "pc" to "stk",
        "piece" to "stk",
        "pieces" to "stk",
    )

    fun parseLine(raw: String): Ingredient {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return Ingredient(name = "", quantity = "", unit = "")

        val match = linePattern.matchEntire(trimmed) ?: return Ingredient(name = trimmed, quantity = "", unit = "")
        val (approxRaw, quantity, unitToken, nameRest) = match.destructured
        val nameTrimmed = nameRest.trim()
        if (nameTrimmed.isEmpty()) return Ingredient(name = trimmed, quantity = "", unit = "")

        val unitKey = normalizeUnitToken(unitToken)
        val unitOut =
            when {
                normalizeUnit(unitKey) != null -> unitKey
                countUnitCanonicalByNormalized.containsKey(unitKey) ->
                    countUnitCanonicalByNormalized.getValue(unitKey)
                else -> return Ingredient(name = trimmed, quantity = "", unit = "")
            }

        val nameWithApprox =
            if (approxRaw.isBlank()) {
                nameTrimmed
            } else {
                "${approxRaw.trim()} $nameTrimmed".trim()
            }

        return Ingredient(name = nameWithApprox, quantity = quantity.trim(), unit = unitOut)
    }

    private fun normalizeUnitToken(token: String): String =
        token.trim().lowercase().trimEnd('.')
}
