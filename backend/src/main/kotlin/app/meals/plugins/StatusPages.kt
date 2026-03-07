package app.meals.plugins

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import kotlinx.serialization.Serializable

@Serializable
data class ErrorResponse(val error: String, val detail: String? = null)

fun Application.configureStatusPages() {
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            val message = cause.message ?: cause.javaClass.simpleName
            cause.printStackTrace()
            call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Internal server error", message))
        }
    }
}
