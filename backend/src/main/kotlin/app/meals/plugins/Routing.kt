package app.meals.plugins

import app.meals.routes.mealPlanRoutes
import app.meals.routes.recipeRoutes
import app.meals.routes.shoppingListRoutes
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.io.File

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
        // Serve frontend SPA when "web" dir exists (e.g. single-container Docker)
        val webDir = File("web")
        if (webDir.isDirectory) {
            singlePageApplication {
                filesPath = "web"
            }
        }
    }
}
