package app.meals.routes

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.application.call
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class RequireUuidParamTest {

    private fun minimalApp(block: suspend io.ktor.server.testing.ApplicationTestBuilder.() -> Unit) =
        testApplication {
            environment {
                config = MapApplicationConfig()
            }
            application {
                install(ContentNegotiation) { json() }
                routing {
                    get("/items/{id}") {
                        val id = call.requireUuidParam("id") ?: return@get
                        call.respond(mapOf("id" to id.toString()))
                    }
                    get("/no-param") {
                        val id = call.requireUuidParam("id") ?: return@get
                        call.respond(mapOf("id" to id.toString()))
                    }
                }
            }
            block()
        }

    @Test
    fun `returns parsed UUID for valid parameter`() = minimalApp {
        val expected = UUID.randomUUID()
        val response = client.get("/items/$expected")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains(expected.toString()))
    }

    @Test
    fun `responds 400 for invalid UUID`() = minimalApp {
        val response = client.get("/items/not-a-uuid")
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("Invalid UUID"))
    }

    @Test
    fun `responds 400 when parameter is absent`() = minimalApp {
        val response = client.get("/no-param")
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("Missing parameter"))
    }
}
