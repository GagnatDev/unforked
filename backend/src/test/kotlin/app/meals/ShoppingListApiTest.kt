package app.meals

import app.meals.domain.DayAssignment
import app.meals.domain.Ingredient
import app.meals.domain.MealPlanDoc
import app.meals.domain.RecipeDoc
import app.meals.domain.ShoppingListDoc
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

class ShoppingListApiTest {

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
    fun `shopping list aggregates quantities for same ingredient`() = testApplication {
        application { module() }

        val flour = Ingredient("flour", "200", "g")
        val recipe1 = RecipeDoc(
            name = "Recipe A",
            description = "",
            ingredients = listOf(flour, Ingredient("salt", "1", "pinch")),
            steps = emptyList(),
            servings = 2,
            tags = emptyList()
        )
        val recipe2 = RecipeDoc(
            name = "Recipe B",
            description = "",
            ingredients = listOf(Ingredient("flour", "300", "g"), Ingredient("sugar", "50", "g")),
            steps = emptyList(),
            servings = 2,
            tags = emptyList()
        )

        val create1 = client.post("/api/recipes") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RecipeDoc.serializer(), recipe1))
        }
        assertEquals(HttpStatusCode.Created, create1.status)
        val id1 = json.parseToJsonElement(create1.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

        val create2 = client.post("/api/recipes") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RecipeDoc.serializer(), recipe2))
        }
        assertEquals(HttpStatusCode.Created, create2.status)
        val id2 = json.parseToJsonElement(create2.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

        val weekId = "2026-W10"
        val plan = MealPlanDoc(
            weekIdentifier = weekId,
            assignments = listOf(
                DayAssignment("monday", id1, "Recipe A"),
                DayAssignment("tuesday", id2, "Recipe B")
            )
        )
        client.put("/api/meal-plans/current?week=$weekId") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(MealPlanDoc.serializer(), plan))
        }.let { assertEquals(HttpStatusCode.OK, it.status) }

        val listResponse = client.get("/api/shopping-lists?week=$weekId")
        assertEquals(HttpStatusCode.OK, listResponse.status)
        val listBody = listResponse.bodyAsText()
        val list = json.decodeFromString(ShoppingListDoc.serializer(), listBody)
        assertEquals(weekId, list.weekIdentifier)

        val flourItem = list.items.find { it.name.equals("flour", ignoreCase = true) }
        assertNotNull(flourItem, "Shopping list should contain flour: $list")
        assertEquals("500", flourItem!!.quantity, "Flour should be summed 200+300=500")
        assertEquals("g", flourItem.unit)
    }

    @Test
    fun `shopping list returns empty when no meal plan for week`() = testApplication {
        application { module() }
        val response = client.get("/api/shopping-lists?week=2020-W01")
        assertEquals(HttpStatusCode.OK, response.status)
        val list = json.decodeFromString(ShoppingListDoc.serializer(), response.bodyAsText())
        assertEquals("2020-W01", list.weekIdentifier)
        assertTrue(list.items.isEmpty())
    }
}
