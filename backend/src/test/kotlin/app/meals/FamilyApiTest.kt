package app.meals

import app.meals.auth.DevAuth
import app.meals.domain.FamilyResponse
import app.meals.domain.MealPlanDoc
import app.meals.domain.PatchFamilyRequest
import app.meals.domain.RecipeDoc
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class FamilyApiTest {

    private val json = apiTestJson

    @Test
    fun `recipes are isolated between families`() = testWithApp {
        client.get("/health")
        val userB = createUser(client, "b@other.test", "pw", "user", json)
        val tokenB = tokenFor(userB.id, "user")

        val soup = minimalRecipe("Soup")
        val devRecipeId = createRecipe(client, soup, json)

        val listB = client.get("/api/recipes") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.OK, listB.status)
        assertEquals(0, json.parseToJsonElement(listB.bodyAsText()).jsonArray.size)

        val getForeign = client.get("/api/recipes/$devRecipeId") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.NotFound, getForeign.status)
    }

    @Test
    fun `accepting invite moves recipes and drops meal plans from old family`() = testWithApp {
        client.get("/health")
        val joiner = createUser(client, "joiner@test.com", "pw", "user", json)
        val tokenB = tokenFor(joiner.id, "user")

        val bowl = minimalRecipe("Bowl")
        client.post("/api/recipes") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RecipeDoc.serializer(), bowl))
        }

        val week = "2099-W01"
        val plan = MealPlanDoc(weekIdentifier = week, defaultPersons = 2, assignments = emptyList())
        client.put("/api/meal-plans/current?week=$week") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(MealPlanDoc.serializer(), plan))
        }

        val invite = createInvite(client, "joiner@test.com", json)

        val acceptRes = postAcceptFamilyInvite(client, invite.token, tokenB, json)
        assertEquals(HttpStatusCode.OK, acceptRes.status, acceptRes.bodyAsText())

        val listAfter = client.get("/api/recipes") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        val names = json.parseToJsonElement(listAfter.bodyAsText()).jsonArray.map {
            it.jsonObject["doc"]!!.jsonObject["name"]!!.jsonPrimitive.content
        }
        assertTrue(names.contains("Bowl"))

        val planAfter = client.get("/api/meal-plans/current?week=$week") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.OK, planAfter.status)
        val planDoc = json.parseToJsonElement(planAfter.bodyAsText()).jsonObject
        val assignmentCount = planDoc["assignments"]?.jsonArray?.size ?: 0
        assertEquals(0, assignmentCount)
    }

    @Test
    fun `GET family returns details and members`() = testWithApp {
        val res = client.get("/api/family")
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val family = json.decodeFromString(FamilyResponse.serializer(), res.bodyAsText())
        assertEquals(DevAuth.FAMILY_ID, family.id)
        assertEquals(4, family.defaultMealPlanPersons)
        assertTrue(family.members.any { it.email == DevAuth.EMAIL })
    }

    @Test
    fun `GET family includes pending invites`() = testWithApp {
        createInvite(client, "pending@test.com", json)
        val res = client.get("/api/family")
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val family = json.decodeFromString(FamilyResponse.serializer(), res.bodyAsText())
        assertEquals(1, family.pendingInvites.size)
        assertEquals("pending@test.com", family.pendingInvites[0].inviteeEmail)
        assertTrue(family.pendingInvites[0].token.isNotBlank())
    }

    @Test
    fun `PATCH family updates defaultMealPlanPersons`() = testWithApp {
        val res = client.patch("/api/family") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(PatchFamilyRequest.serializer(), PatchFamilyRequest(3)))
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val body = json.parseToJsonElement(res.bodyAsText()).jsonObject
        assertEquals(3, body["defaultMealPlanPersons"]!!.jsonPrimitive.content.toInt())
        val get = client.get("/api/family")
        val fam = json.decodeFromString(FamilyResponse.serializer(), get.bodyAsText())
        assertEquals(3, fam.defaultMealPlanPersons)
    }

    @Test
    fun `PATCH family rejects defaultMealPlanPersons below 1`() = testWithApp {
        val res = client.patch("/api/family") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(PatchFamilyRequest.serializer(), PatchFamilyRequest(0)))
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `PATCH family rejects defaultMealPlanPersons above 50`() = testWithApp {
        val res = client.patch("/api/family") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(PatchFamilyRequest.serializer(), PatchFamilyRequest(51)))
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }
}
