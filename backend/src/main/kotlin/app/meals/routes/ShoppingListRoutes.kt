package app.meals.routes

import app.meals.domain.DayAssignment
import app.meals.domain.MealPlanDoc
import app.meals.domain.RecipeDoc
import app.meals.domain.ShoppingListDoc
import app.meals.domain.ShoppingListItem
import app.meals.storage.MealPlanRepository
import app.meals.storage.RecipeRepository
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDate
import java.time.temporal.IsoFields
import java.util.UUID
import kotlin.math.ceil

fun Route.shoppingListRoutes() {
    get("/shopping-lists") {
        val weekParam = call.request.queryParameters["week"]
        val weekId = weekParam ?: currentWeekIdentifier()
        val plan = MealPlanRepository.findByWeek(weekId)?.second ?: run {
            call.respond(ShoppingListDoc(weekIdentifier = weekId, items = emptyList()))
            return@get
        }
        val distinctIds = plan.assignments.map { it.recipeId }.distinct().map { UUID.fromString(it) }
        val recipes = RecipeRepository.findByIds(distinctIds)
        val recipeById = recipes.associateBy { it.first.toString() }
        val aggregated = mutableMapOf<String, MutableList<Pair<String, String>>>() // key = normalized name+unit -> list of (quantity, recipeId)
        for (assignment in plan.assignments) {
            val recipeId = assignment.recipeId
            val (recipeUuid, doc) = recipeById[recipeId] ?: continue
            val scale = scaleForAssignment(plan, assignment, doc)
            val idStr = recipeUuid.toString()
            for (ing in doc.ingredients) {
                val key = "${ing.name.lowercase().trim()}|${ing.unit}"
                val list = aggregated.getOrPut(key) { mutableListOf() }
                val scaledQty = scaledIngredientQuantity(ing.quantity, scale)
                list.add(scaledQty to idStr)
            }
        }
        val items = aggregated.map { (key, qtyList) ->
            val (name, unit) = key.split("|", limit = 2)
            val quantities = qtyList.map { it.first }.filter { it.isNotBlank() }
            val combinedQty = summarizeQuantities(quantities)
            val recipeIdsUsed = qtyList.map { it.second }.distinct()
            ShoppingListItem(name = name.replaceFirstChar { it.uppercase() }, quantity = combinedQty, unit = unit, recipeIds = recipeIdsUsed)
        }.sortedBy { it.name }
        call.respond(ShoppingListDoc(weekIdentifier = weekId, items = items))
    }
}

internal fun scaleForAssignment(plan: MealPlanDoc, assignment: DayAssignment, doc: RecipeDoc): Double {
    val effective = assignment.persons ?: plan.defaultPersons
    if (effective == null) return 1.0
    val servings = doc.servings.coerceAtLeast(1)
    return effective.toDouble() / servings
}

/**
 * Scales a recipe line quantity for shopping list aggregation.
 * Numeric strings are multiplied by [scale]; non-numeric use [ceil] of scale as a discrete count prefix (e.g. `2× pinch`).
 */
internal fun scaledIngredientQuantity(rawQuantity: String, scale: Double): String {
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
internal fun summarizeQuantities(quantities: List<String>): String {
    if (quantities.isEmpty()) return "—"
    val parsed = quantities.mapNotNull { q -> parseQuantity(q) }
    return if (parsed.size == quantities.size) {
        val sum = parsed.sum()
        formatQuantity(sum)
    } else {
        quantities.distinct().joinToString(", ")
    }
}

internal fun parseQuantity(s: String): Double? = s.trim().replace(",", ".").toDoubleOrNull()

internal fun formatQuantity(value: Double): String =
    if (value == value.toLong().toDouble()) "${value.toLong()}" else "%.2f".format(value).trimEnd('0').trimEnd('.')

private fun currentWeekIdentifier(): String {
    val now = LocalDate.now()
    val weekNumber = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = now.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, weekNumber)
}
