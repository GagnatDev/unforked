package app.meals.service

import app.meals.domain.DayAssignment
import app.meals.domain.MealPlanDoc
import app.meals.domain.RecipeDoc
import app.meals.domain.ShoppingListItem
import app.meals.domain.UnitFamily
import app.meals.domain.bestDisplayUnit
import app.meals.domain.normalizeUnit
import java.util.UUID
import kotlin.math.ceil

private sealed class ShoppingContribution {
    data class InFamily(val baseAmount: Double, val recipeId: String) : ShoppingContribution()

    data class Raw(val quantity: String, val recipeId: String) : ShoppingContribution()
}

object ShoppingListService {

    /**
     * Aggregates ingredients across assignments; merges by known unit family (volume/weight) when quantity is numeric.
     */
    fun buildAggregatedShoppingItems(
        plan: MealPlanDoc,
        recipeById: Map<String, Pair<UUID, RecipeDoc>>,
    ): List<ShoppingListItem> {
        val aggregated = mutableMapOf<String, MutableList<ShoppingContribution>>()
        for (assignment in plan.assignments) {
            val recipeId = assignment.recipeId
            val (recipeUuid, doc) = recipeById[recipeId] ?: continue
            val scale = scaleForAssignment(plan, assignment, doc)
            val idStr = recipeUuid.toString()
            for (ing in doc.ingredients) {
                val name = ing.name.lowercase().trim()
                val known = normalizeUnit(ing.unit)
                val scaledQtyStr = scaledIngredientQuantity(ing.quantity, scale)
                val parsed = parseQuantity(scaledQtyStr)
                val key =
                    if (known != null && parsed != null) {
                        "$name|${known.family.name}"
                    } else {
                        "$name|${ing.unit}"
                    }
                val list = aggregated.getOrPut(key) { mutableListOf() }
                if (known != null && parsed != null) {
                    list.add(ShoppingContribution.InFamily(parsed * known.toBase, idStr))
                } else {
                    list.add(ShoppingContribution.Raw(scaledQtyStr, idStr))
                }
            }
        }
        return aggregated.map { (key, contribs) ->
            val (nameLower, second) = key.split("|", limit = 2).let { parts ->
                parts[0] to parts.getOrElse(1) { "" }
            }
            val displayName = nameLower.replaceFirstChar { it.uppercase() }
            val recipeIdsUsed = contribs.map { c ->
                when (c) {
                    is ShoppingContribution.InFamily -> c.recipeId
                    is ShoppingContribution.Raw -> c.recipeId
                }
            }.distinct()
            when (second) {
                UnitFamily.VOLUME.name, UnitFamily.WEIGHT.name -> {
                    val family = UnitFamily.valueOf(second)
                    val sum = contribs.filterIsInstance<ShoppingContribution.InFamily>().sumOf { it.baseAmount }
                    val (displayVal, unit) = bestDisplayUnit(sum, family)
                    ShoppingListItem(
                        name = displayName,
                        quantity = formatQuantity(displayVal),
                        unit = unit,
                        recipeIds = recipeIdsUsed,
                    )
                }
                else -> {
                    val quantities =
                        contribs.filterIsInstance<ShoppingContribution.Raw>().map { it.quantity }.filter { it.isNotBlank() }
                    val combinedQty = summarizeQuantities(quantities)
                    ShoppingListItem(
                        name = displayName,
                        quantity = combinedQty,
                        unit = second,
                        recipeIds = recipeIdsUsed,
                    )
                }
            }
        }.sortedBy { it.name }
    }

    fun scaleForAssignment(plan: MealPlanDoc, assignment: DayAssignment, doc: RecipeDoc): Double {
        val effective = assignment.persons ?: plan.defaultPersons
        if (effective == null) return 1.0
        val servings = doc.servings.coerceAtLeast(1)
        return effective.toDouble() / servings
    }

    /**
     * Scales a recipe line quantity for shopping list aggregation.
     * Numeric strings are multiplied by [scale]; non-numeric use [ceil] of scale as a discrete count prefix (e.g. `2× pinch`).
     */
    fun scaledIngredientQuantity(rawQuantity: String, scale: Double): String {
        val q = rawQuantity.trim()
        if (q.isBlank()) return q
        val parsed = parseQuantity(q)
        return if (parsed != null) {
            formatQuantity(parsed * scale)
        } else {
            val n = ceil(scale).toInt().coerceAtLeast(1)
            if (n == 1) q else "${n}× $q"
        }
    }

    /**
     * Summarizes a list of quantity strings: if all parse as numbers, returns their sum (e.g. "200" + "300" -> "500");
     * otherwise returns them joined with ", " (e.g. "pinch", "handful" -> "pinch, handful").
     */
    fun summarizeQuantities(quantities: List<String>): String {
        if (quantities.isEmpty()) return "—"
        val parsed = quantities.mapNotNull { q -> parseQuantity(q) }
        return if (parsed.size == quantities.size) {
            val sum = parsed.sum()
            formatQuantity(sum)
        } else {
            quantities.distinct().joinToString(", ")
        }
    }
}

private fun parseQuantity(s: String): Double? = s.trim().replace(",", ".").toDoubleOrNull()

private fun formatQuantity(value: Double): String =
    if (value == value.toLong().toDouble()) "${value.toLong()}" else "%.2f".format(value).trimEnd('0').trimEnd('.')
