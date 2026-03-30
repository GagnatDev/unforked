package app.meals.routes

import app.meals.auth.AuthConfig
import app.meals.domain.LoginRequest
import app.meals.domain.LoginResponse
import app.meals.domain.RegisterWithInviteRequest
import app.meals.domain.SetupRequest
import app.meals.domain.UserInfo
import app.meals.service.FamilyInviteService
import app.meals.storage.UserRepository
import at.favre.lib.crypto.bcrypt.BCrypt
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.authRoutes() {
    route("/auth") {
        post("/login") {
            val body = call.receive<LoginRequest>()
            val email = body.email.trim().lowercase().ifBlank { null } ?: run {
                return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Email required"))
            }
            val user = UserRepository.findByEmail(email)
                ?: return@post call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid email or password"))
            val verified = BCrypt.verifyer().verify(body.password.toByteArray(), user.passwordHash.toByteArray()).verified
            if (!verified) {
                return@post call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid email or password"))
            }
            val token = AuthConfig.createToken(user.id.toString(), user.role)
            call.respond(
                LoginResponse(
                    token,
                    UserInfo(user.id.toString(), user.email, user.role, user.familyId.toString()),
                )
            )
        }
        post("/setup") {
            if (UserRepository.count() > 0L) {
                return@post call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Setup already completed"))
            }
            val body = call.receive<SetupRequest>()
            val email = body.email.trim().lowercase().ifBlank { null } ?: run {
                return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Email required"))
            }
            val password = body.password.ifBlank { null } ?: run {
                return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Password required"))
            }
            val hashString = BCrypt.withDefaults().hashToString(12, password.toCharArray())
            val id = UserRepository.insert(email, hashString, "admin")
            val token = AuthConfig.createToken(id.toString(), "admin")
            val user = UserRepository.findById(id)!!
            call.respond(
                LoginResponse(
                    token,
                    UserInfo(user.id.toString(), user.email, user.role, user.familyId.toString()),
                )
            )
        }
        post("/register-invite") {
            val body = call.receive<RegisterWithInviteRequest>()
            val token = body.token.trim().ifBlank { null }
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Token required"))
            val email = body.email.trim().lowercase().ifBlank { null }
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Email required"))
            val password = body.password.ifBlank { null }
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Password required"))
            try {
                val userId = FamilyInviteService.registerWithInvite(token, email, password)
                val user = UserRepository.findById(userId)!!
                val jwt = AuthConfig.createToken(user.id.toString(), user.role)
                call.respond(
                    LoginResponse(
                        jwt,
                        UserInfo(user.id.toString(), user.email, user.role, user.familyId.toString()),
                    )
                )
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Registration failed")))
            }
        }
    }
}
