package app.meals.routes

import app.meals.domain.UserPrincipal
import app.meals.storage.UserRepository
import app.meals.storage.UserRow
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.auth.principal
import io.ktor.server.response.respond
import java.util.UUID

fun ApplicationCall.userAndFamily(): Pair<UserRow, UUID>? {
    val principal = principal<UserPrincipal>() ?: return null
    val userId = runCatching { UUID.fromString(principal.userId) }.getOrNull() ?: return null
    val user = UserRepository.findById(userId) ?: return null
    return user to user.familyId
}

/**
 * Responds 401 and returns null when the caller is not authenticated with a resolvable user/family.
 */
suspend fun ApplicationCall.requireFamilyId(): UUID? {
    val id = userAndFamily()?.second
    if (id == null) {
        respond(HttpStatusCode.Unauthorized, mapOf("error" to "Not authenticated"))
        return null
    }
    return id
}

suspend fun ApplicationCall.requireUserAndFamily(): Pair<UserRow, UUID>? {
    val pair = userAndFamily()
    if (pair == null) {
        respond(HttpStatusCode.Unauthorized, mapOf("error" to "Not authenticated"))
        return null
    }
    return pair
}

/**
 * Parses a UUID path parameter by [name], responding 400 with a standardized error body on failure.
 * Returns `null` when the parameter is missing or not a valid UUID (after responding).
 */
suspend fun ApplicationCall.requireUuidParam(name: String): UUID? {
    val raw = parameters[name]
    if (raw == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing parameter '$name'"))
        return null
    }
    return runCatching { UUID.fromString(raw) }.getOrElse {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid UUID for parameter '$name'"))
        null
    }
}
