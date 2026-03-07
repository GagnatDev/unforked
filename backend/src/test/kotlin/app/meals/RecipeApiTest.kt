package app.meals

import app.meals.domain.RecipeDoc
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

class RecipeApiTest {

    companion object {
        private val postgres = PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine"))
            .apply {
                withDatabaseName("meals")
                withUsername("meals")
                withPassword("meals")
            }

        @JvmStatic
        @BeforeAll
        fun startContainer() {
            postgres.start()
            System.setProperty("DB_URL", postgres.jdbcUrl)
            System.setProperty("DB_USER", postgres.username)
            System.setProperty("DB_PASSWORD", postgres.password)
        }

        @JvmStatic
        @AfterAll
        fun stopContainer() {
            System.clearProperty("DB_URL")
            System.clearProperty("DB_USER")
            System.clearProperty("DB_PASSWORD")
            postgres.stop()
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `GET recipes returns empty list when no recipes`() = testApplication {
        application { module() }
        val response = client.get("/api/recipes")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = response.bodyAsText()
        assertTrue(body.contains("[]") || body == "[]")
    }

    @Test
    fun `POST recipe creates and GET returns it`() = testApplication {
        application { module() }
        val recipe = RecipeDoc(
            name = "Test Soup",
            description = "A test",
            ingredients = emptyList(),
            steps = listOf("Step 1"),
            servings = 2,
            tags = listOf("easy")
        )
        val createResponse = client.post("/api/recipes") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(recipe))
        }
        assertEquals(HttpStatusCode.Created, createResponse.status)
        val createBody = createResponse.bodyAsText()
        assertTrue(createBody.contains("Test Soup"))
        val id = json.parseToJsonElement(createBody).jsonObject["id"]!!.jsonPrimitive.content

        val getResponse = client.get("/api/recipes/$id")
        assertEquals(HttpStatusCode.OK, getResponse.status)
        assertTrue(getResponse.bodyAsText().contains("Test Soup"))
    }

    @Test
    fun `health returns ok`() = testApplication {
        application { module() }
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains("ok"))
    }
}
