package app.meals.plugins

import app.meals.routes.mealPlanRoutes
import app.meals.routes.recipeRoutes
import app.meals.routes.shoppingListRoutes
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    routing {
        get("/health") {
            call.respond(mapOf("status" to "ok"))
        }
        route("/api") {
            recipeRoutes()
            mealPlanRoutes()
            shoppingListRoutes()
        }
    }
}
