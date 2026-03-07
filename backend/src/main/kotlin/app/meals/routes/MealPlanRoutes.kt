package app.meals.routes

import app.meals.domain.MealPlanDoc
import app.meals.storage.MealPlanRepository
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDate
import java.time.temporal.WeekFields
import java.util.Locale

fun Route.mealPlanRoutes() {
    route("/meal-plans") {
        get("/current") {
            val weekParam = call.request.queryParameters["week"]
            val weekId = weekParam ?: currentWeekIdentifier()
            val plan = MealPlanRepository.findByWeek(weekId)
            if (plan == null) {
                call.respond(MealPlanDoc(weekIdentifier = weekId, assignments = emptyList()))
            } else {
                call.respond(plan.second)
            }
        }
        put("/current") {
            val weekParam = call.request.queryParameters["week"]
            val weekId = weekParam ?: currentWeekIdentifier()
            val body = call.receive<MealPlanDoc>()
            if (body.weekIdentifier != weekId) {
                call.respond(status = io.ktor.http.HttpStatusCode.BadRequest, "weekIdentifier must match query week or current")
                return@put
            }
            MealPlanRepository.upsert(body)
            call.respond(body)
        }
    }
}

private fun currentWeekIdentifier(): String {
    val now = LocalDate.now()
    val wf = WeekFields.of(Locale.getDefault())
    val weekNumber = now.get(wf.weekOfWeekBasedYear())
    val year = now.get(wf.weekBasedYear())
    return "%d-W%02d".format(year, weekNumber)
}
