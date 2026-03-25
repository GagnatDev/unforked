package app.meals

import app.meals.domain.RecipeDoc
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class RecipeApiTest {

    companion object {
        @JvmStatic
        @BeforeAll
        fun startContainer() {
            TestDatabase.startIfNeeded()
        }

        @JvmStatic
        @AfterAll
        fun stopContainer() {
            TestDatabase.stopIfStarted()
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    @BeforeEach
    fun resetDatabase() {
        TestDatabase.resetSchema()
    }

    @Test
    fun `GET recipes returns ok and JSON array`() = testWithApp {
        val response = client.get("/api/recipes")
        assertEquals(HttpStatusCode.OK, response.status)
        val list = json.decodeFromString<List<kotlinx.serialization.json.JsonObject>>(response.bodyAsText())
        assertTrue(list.size >= 0, "Response must be a valid JSON array")
    }

    @Test
    fun `POST recipe creates and GET returns it`() = testWithApp {
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
    fun `POST recipe without tags returns tags as empty array`() = testWithApp {
        val recipe = RecipeDoc(
            name = "No Tag Recipe",
            description = "No tags provided",
            ingredients = emptyList(),
            steps = emptyList(),
            servings = 2,
        )
        val createResponse = client.post("/api/recipes") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(recipe))
        }
        assertEquals(HttpStatusCode.Created, createResponse.status)

        val created = json.parseToJsonElement(createResponse.bodyAsText()).jsonObject
        val doc = created["doc"]!!.jsonObject
        assertTrue(doc.containsKey("tags"), "Response doc must include tags field")
        assertEquals(0, doc["tags"]!!.jsonArray.size, "tags must be an empty array when omitted by user")
    }

    @Test
    fun `health returns ok`() = testWithApp {
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains("ok"))
    }
}
