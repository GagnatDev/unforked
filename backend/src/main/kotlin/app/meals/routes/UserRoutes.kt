package app.meals.routes

import app.meals.domain.CreateUserRequest
import app.meals.domain.UserInfo
import app.meals.domain.UserPrincipal
import app.meals.storage.UserRepository
import at.favre.lib.crypto.bcrypt.BCrypt
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import java.util.UUID

fun Route.userRoutes() {
    post("/users") {
        val principal = call.principal<UserPrincipal>()
            ?: return@post call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Not authenticated"))
        if (principal.role != "admin") {
            return@post call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Admin only"))
        }
        val body = call.receive<CreateUserRequest>()
        val email = body.email.trim().lowercase().ifBlank { null } ?: run {
            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Email required"))
        }
        val password = body.password.ifBlank { null } ?: run {
            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Password required"))
        }
        if (UserRepository.findByEmail(email) != null) {
            return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "Email already registered"))
        }
        val role = body.role.ifBlank { "user" }.lowercase().let { if (it in listOf("admin", "user")) it else "user" }
        val hashString = BCrypt.withDefaults().hashToString(12, password.toCharArray())
        val id = UserRepository.insert(email, hashString, role)
        val user = UserRepository.findById(id)!!
        call.respond(
            HttpStatusCode.Created,
            UserInfo(user.id.toString(), user.email, user.role, user.familyId.toString()),
        )
    }
}
