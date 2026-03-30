package app.meals.domain

import io.ktor.server.auth.Principal
import kotlinx.serialization.Serializable

/** Principal used in route handlers; set from JWT claims or dev user when auth is disabled. */
data class UserPrincipal(val userId: String, val role: String) : Principal

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class SetupRequest(val email: String, val password: String)

@Serializable
data class LoginResponse(
    val token: String,
    val user: UserInfo
)

@Serializable
data class UserInfo(
    val id: String,
    val email: String,
    val role: String,
    val familyId: String,
)

@Serializable
data class CreateUserRequest(
    val email: String,
    val password: String,
    val role: String = "user"
)
