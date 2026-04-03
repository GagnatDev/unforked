package app.meals.routes

import app.meals.domain.ShoppingListDoc
import app.meals.service.ShoppingListService
import app.meals.storage.MealPlanRepository
import app.meals.storage.RecipeRepository
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import java.time.LocalDate
import java.time.temporal.IsoFields
import java.util.UUID

fun Route.shoppingListRoutes() {
    get("/shopping-lists") {
        val familyId = call.requireFamilyId() ?: return@get
        val weekParam = call.request.queryParameters["week"]
        val weekId = weekParam ?: currentWeekIdentifier()
        val plan = MealPlanRepository.findByWeek(familyId, weekId)?.second ?: run {
            call.respond(ShoppingListDoc(weekIdentifier = weekId, items = emptyList()))
            return@get
        }
        val distinctIds = plan.assignments.map { it.recipeId }.distinct().map { UUID.fromString(it) }
        val recipes = RecipeRepository.findByIds(familyId, distinctIds)
        val recipeById = recipes.associateBy { it.first.toString() }
        val items = ShoppingListService.buildAggregatedShoppingItems(plan, recipeById)
        call.respond(ShoppingListDoc(weekIdentifier = weekId, items = items))
    }
}

private fun currentWeekIdentifier(): String {
    val now = LocalDate.now()
    val weekNumber = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = now.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, weekNumber)
}
