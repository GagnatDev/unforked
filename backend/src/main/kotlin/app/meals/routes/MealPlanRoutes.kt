package app.meals.routes

import app.meals.domain.MealPlanDoc
import app.meals.storage.MealPlanRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import java.time.LocalDate
import java.time.temporal.IsoFields

fun Route.mealPlanRoutes() {
    route("/meal-plans") {
        get("/current") {
            val familyId = call.requireFamilyId() ?: return@get
            val weekParam = call.request.queryParameters["week"]
            val weekId = weekParam ?: currentWeekIdentifier()
            val plan = MealPlanRepository.findByWeek(familyId, weekId)
            if (plan == null) {
                call.respond(MealPlanDoc(weekIdentifier = weekId, assignments = emptyList()))
            } else {
                call.respond(plan.second)
            }
        }
        put("/current") {
            val familyId = call.requireFamilyId() ?: return@put
            val weekParam = call.request.queryParameters["week"]
            val weekId = weekParam ?: currentWeekIdentifier()
            val body = call.receive<MealPlanDoc>()
            if (body.weekIdentifier != weekId) {
                call.respond(status = HttpStatusCode.BadRequest, "weekIdentifier must match query week or current")
                return@put
            }
            MealPlanRepository.upsert(familyId, body)
            call.respond(body)
        }
    }
}

private fun currentWeekIdentifier(): String {
    val now = LocalDate.now()
    val weekNumber = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = now.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, weekNumber)
}
