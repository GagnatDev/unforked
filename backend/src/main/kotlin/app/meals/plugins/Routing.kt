package app.meals.plugins

import app.meals.domain.UserInfo
import app.meals.domain.UserPrincipal
import app.meals.routes.authRoutes
import app.meals.routes.familyRoutes
import app.meals.routes.mealPlanRoutes
import app.meals.routes.recipeRoutes
import app.meals.routes.shoppingListRoutes
import app.meals.routes.userRoutes
import app.meals.storage.UserRepository
import io.ktor.server.application.*
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.principal
import io.ktor.server.http.content.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.io.File
import java.util.UUID

fun Application.configureRouting() {
    routing {
        get("/health") {
            call.respond(mapOf("status" to "ok"))
        }
        route("/api") {
            authRoutes()
            authenticate("auth") {
                get("/auth/me") {
                    val principal = call.principal<UserPrincipal>()
                        ?: return@get call.respond(io.ktor.http.HttpStatusCode.Unauthorized, mapOf("error" to "Not authenticated"))
                    val user = UserRepository.findById(UUID.fromString(principal.userId))
                        ?: return@get call.respond(io.ktor.http.HttpStatusCode.NotFound, mapOf("error" to "User not found"))
                    call.respond(
                        UserInfo(
                            principal.userId,
                            user.email,
                            user.role,
                            user.familyId.toString(),
                        )
                    )
                }
                userRoutes()
                familyRoutes()
                recipeRoutes()
                mealPlanRoutes()
                shoppingListRoutes()
            }
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
