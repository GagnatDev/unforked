package app.meals.routes

import app.meals.domain.ShoppingListItem
import app.meals.domain.ShoppingListDoc
import app.meals.storage.MealPlanRepository
import app.meals.storage.RecipeRepository
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDate
import java.time.temporal.IsoFields
import java.util.UUID

fun Route.shoppingListRoutes() {
    get("/shopping-lists") {
        val weekParam = call.request.queryParameters["week"]
        val weekId = weekParam ?: currentWeekIdentifier()
        val plan = MealPlanRepository.findByWeek(weekId)?.second ?: run {
            call.respond(ShoppingListDoc(weekIdentifier = weekId, items = emptyList()))
            return@get
        }
        val recipeIdsWithDuplicates = plan.assignments.map { it.recipeId }
        val recipeIdCount = recipeIdsWithDuplicates.groupingBy { it }.eachCount()
        val distinctIds = recipeIdsWithDuplicates.distinct().map { UUID.fromString(it) }
        val recipes = RecipeRepository.findByIds(distinctIds)
        val aggregated = mutableMapOf<String, MutableList<Pair<String, String>>>() // key = normalized name+unit -> list of (quantity, recipeId)
        for ((id, doc) in recipes) {
            val count = recipeIdCount[id.toString()] ?: 1
            for (ing in doc.ingredients) {
                val key = "${ing.name.lowercase().trim()}|${ing.unit}"
                val list = aggregated.getOrPut(key) { mutableListOf() }
                repeat(count) { list.add(ing.quantity.trim() to id.toString()) }
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

private fun parseQuantity(s: String): Double? = s.trim().replace(",", ".").toDoubleOrNull()

private fun formatQuantity(value: Double): String =
    if (value == value.toLong().toDouble()) "${value.toLong()}" else "%.2f".format(value).trimEnd('0').trimEnd('.')

private fun currentWeekIdentifier(): String {
    val now = LocalDate.now()
    val weekNumber = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = now.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, weekNumber)
}
