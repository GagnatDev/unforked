package app.meals

import app.meals.domain.DayAssignment
import app.meals.domain.MealPlanDoc
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.decodeFromString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class MealPlanApiTest {

    private val json = apiTestJson

    @Test
    fun `GET meal-plans current returns empty plan for week with no data`() = testWithApp {
        val week = "2030-W05"
        val response = client.get("/api/meal-plans/current?week=$week")
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        val doc = json.decodeFromString(MealPlanDoc.serializer(), response.bodyAsText())
        assertEquals(week, doc.weekIdentifier)
        assertTrue(doc.assignments.isEmpty())
    }

    @Test
    fun `PUT and GET meal-plans current round-trip`() = testWithApp {
        val recipeId = createRecipe(client, minimalRecipe("Pasta"), json)
        val week = "2027-W03"
        val plan = MealPlanDoc(
            weekIdentifier = week,
            defaultPersons = 3,
            assignments = listOf(DayAssignment("monday", recipeId, "Pasta")),
        )
        val putRes = putMealPlan(client, week, plan, json)
        assertEquals(HttpStatusCode.OK, putRes.status, putRes.bodyAsText())
        val got = json.decodeFromString(MealPlanDoc.serializer(), putRes.bodyAsText())
        assertEquals(week, got.weekIdentifier)
        assertEquals(3, got.defaultPersons)
        assertEquals(1, got.assignments.size)
        assertEquals("monday", got.assignments[0].day)

        val getRes = client.get("/api/meal-plans/current?week=$week")
        assertEquals(HttpStatusCode.OK, getRes.status)
        val loaded = json.decodeFromString(MealPlanDoc.serializer(), getRes.bodyAsText())
        assertEquals(plan.weekIdentifier, loaded.weekIdentifier)
        assertEquals(plan.defaultPersons, loaded.defaultPersons)
        assertEquals(plan.assignments.size, loaded.assignments.size)
        assertEquals(plan.assignments[0].recipeId, loaded.assignments[0].recipeId)
        assertEquals(plan.assignments[0].recipeName, loaded.assignments[0].recipeName)
    }

    @Test
    fun `PUT meal-plans current upsert overwrites previous plan`() = testWithApp {
        val id = createRecipe(client, minimalRecipe("R"), json)
        val week = "2027-W04"
        val first = MealPlanDoc(
            weekIdentifier = week,
            assignments = listOf(DayAssignment("monday", id, "R")),
        )
        putMealPlanOk(client, week, first, json)
        val second = MealPlanDoc(
            weekIdentifier = week,
            defaultPersons = 2,
            assignments = listOf(DayAssignment("tuesday", id, "R")),
        )
        putMealPlanOk(client, week, second, json)
        val getRes = client.get("/api/meal-plans/current?week=$week")
        val loaded = json.decodeFromString(MealPlanDoc.serializer(), getRes.bodyAsText())
        assertEquals(1, loaded.assignments.size)
        assertEquals("tuesday", loaded.assignments[0].day)
        assertEquals(2, loaded.defaultPersons)
    }

    @Test
    fun `PUT meal-plans current rejects weekIdentifier mismatch`() = testWithApp {
        val weekQuery = "2026-W10"
        val body = MealPlanDoc(
            weekIdentifier = "2026-W11",
            assignments = emptyList(),
        )
        val response = putMealPlan(client, weekQuery, body, json)
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `GET meal-plans current defaults to current ISO week when no query param`() = testWithApp {
        val expected = currentIsoWeekIdentifier()
        val response = client.get("/api/meal-plans/current")
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        val doc = json.decodeFromString(MealPlanDoc.serializer(), response.bodyAsText())
        assertEquals(expected, doc.weekIdentifier)
    }
}
