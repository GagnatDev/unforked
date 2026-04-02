package app.meals.plugins

import app.meals.auth.AuthConfig
import app.meals.auth.DevAuth
import app.meals.auth.INSECURE_JWT_SECRET_PLACEHOLDER
import app.meals.domain.UserPrincipal
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.auth.AuthenticationFailedCause
import io.ktor.server.auth.AuthenticationContext
import io.ktor.server.auth.jwt.jwt
import io.ktor.server.auth.authentication
import io.ktor.server.response.respond
import kotlinx.coroutines.runBlocking

internal fun requireJwtSecretConfiguredForProduction(jwtSecret: String) {
    if (jwtSecret.isBlank()) {
        throw IllegalStateException(
            "JWT secret is missing or blank but auth is enabled (auth.disabled=false). " +
                "Set the JWT_SECRET environment variable to a strong secret."
        )
    }
    if (jwtSecret == INSECURE_JWT_SECRET_PLACEHOLDER) {
        throw IllegalStateException(
            "JWT secret is still the default placeholder but auth is enabled (auth.disabled=false). " +
                "Set JWT_SECRET to a strong, unique value; do not use the bundled default."
        )
    }
}

fun Application.configureAuthentication() {
    val jwtSecret = environment.config.property("auth.jwt.secret").getString()
    val issuer = environment.config.property("auth.jwt.issuer").getString()
    val audience = environment.config.property("auth.jwt.audience").getString()
    val authDisabled = environment.config.property("auth.disabled").getString().lowercase() == "true"

    if (!authDisabled) {
        requireJwtSecretConfiguredForProduction(jwtSecret)
    }

    AuthConfig.initFromEnvironment(jwtSecret, issuer, audience, authDisabled)

    val verifier = JWT.require(Algorithm.HMAC256(jwtSecret))
        .withIssuer(issuer)
        .withAudience(audience)
        .build()

    install(io.ktor.server.auth.Authentication) {
        if (authDisabled) {
            provider("auth") {
                authenticate { context ->
                    runBlocking {
                        val authHeader = context.call.request.headers["Authorization"]
                        val token = authHeader?.removePrefix("Bearer ")?.trim()?.takeIf { it.isNotBlank() }
                        if (token != null) {
                            try {
                                val decoded = verifier.verify(token)
                                val userId = decoded.subject ?: decoded.getClaim("sub").asString() ?: ""
                                val role = decoded.getClaim("role").asString() ?: "user"
                                if (userId.isNotEmpty()) context.principal(UserPrincipal(userId, role))
                                else context.challenge("auth", AuthenticationFailedCause.InvalidCredentials) { _, call ->
                                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                                }
                            } catch (_: Exception) {
                                context.challenge("auth", AuthenticationFailedCause.InvalidCredentials) { _, call ->
                                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid or expired token"))
                                }
                            }
                        } else {
                            context.principal(UserPrincipal(DevAuth.USER_ID, "admin"))
                        }
                    }
                }
            }
        } else {
            jwt("auth") {
                verifier(issuer, audience, Algorithm.HMAC256(jwtSecret))
                validate { credential ->
                    val sub = credential.payload.subject ?: credential.payload.getClaim("sub").asString() ?: return@validate null
                    val role = credential.payload.getClaim("role").asString() ?: "user"
                    if (sub.isBlank()) null else UserPrincipal(sub, role)
                }
                challenge { _, _ ->
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Missing or invalid authorization"))
                }
            }
        }
    }
}
