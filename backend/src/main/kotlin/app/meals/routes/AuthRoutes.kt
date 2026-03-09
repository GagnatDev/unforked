package app.meals.routes

import app.meals.auth.AuthConfig
import app.meals.domain.LoginRequest
import app.meals.domain.LoginResponse
import app.meals.domain.SetupRequest
import app.meals.domain.UserInfo
import app.meals.storage.UserRepository
import at.favre.lib.crypto.bcrypt.BCrypt
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

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
            call.respond(LoginResponse(token, UserInfo(user.id.toString(), user.email, user.role)))
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
            call.respond(LoginResponse(token, UserInfo(user.id.toString(), user.email, user.role)))
        }
    }
}
