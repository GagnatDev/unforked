package app.meals

import app.meals.auth.AuthConfig
import app.meals.domain.AcceptFamilyInviteRequest
import app.meals.domain.CreateFamilyInviteRequest
import app.meals.domain.CreateFamilyInviteResponse
import app.meals.domain.CreateUserRequest
import app.meals.domain.MealPlanDoc
import app.meals.domain.RecipeDoc
import app.meals.domain.UserInfo
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import java.time.LocalDate
import java.time.temporal.IsoFields

/** Shared JSON config for API integration tests. */
val apiTestJson = Json { ignoreUnknownKeys = true }

fun tokenFor(userId: String, role: String): String = AuthConfig.createToken(userId, role)

fun currentIsoWeekIdentifier(): String {
    val now = LocalDate.now()
    val weekNumber = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = now.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, weekNumber)
}

suspend fun createRecipe(
    client: HttpClient,
    recipe: RecipeDoc,
    json: Json = apiTestJson,
): String {
    val response = client.post("/api/recipes") {
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(RecipeDoc.serializer(), recipe))
    }
    assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
    return json.parseToJsonElement(response.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content
}

suspend fun createUser(
    client: HttpClient,
    email: String,
    password: String,
    role: String = "user",
    json: Json = apiTestJson,
): UserInfo {
    val body = CreateUserRequest(email = email, password = password, role = role)
    val response = client.post("/api/users") {
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(CreateUserRequest.serializer(), body))
    }
    assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
    return json.decodeFromString(UserInfo.serializer(), response.bodyAsText())
}

suspend fun postFamilyInvite(
    client: HttpClient,
    email: String,
    json: Json = apiTestJson,
): HttpResponse {
    return client.post("/api/family/invites") {
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(CreateFamilyInviteRequest.serializer(), CreateFamilyInviteRequest(email)))
    }
}

suspend fun createInvite(
    client: HttpClient,
    email: String,
    json: Json = apiTestJson,
): CreateFamilyInviteResponse {
    val response = postFamilyInvite(client, email, json)
    assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
    return json.decodeFromString(CreateFamilyInviteResponse.serializer(), response.bodyAsText())
}

suspend fun postAcceptFamilyInvite(
    client: HttpClient,
    token: String,
    bearerToken: String? = null,
    json: Json = apiTestJson,
): HttpResponse {
    return client.post("/api/family/invites/accept") {
        bearerToken?.let { header(HttpHeaders.Authorization, "Bearer $it") }
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(AcceptFamilyInviteRequest.serializer(), AcceptFamilyInviteRequest(token)))
    }
}

suspend fun putMealPlan(
    client: HttpClient,
    weekId: String,
    plan: MealPlanDoc,
    json: Json = apiTestJson,
): HttpResponse {
    return client.put("/api/meal-plans/current?week=$weekId") {
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(MealPlanDoc.serializer(), plan))
    }
}

suspend fun putMealPlanOk(
    client: HttpClient,
    weekId: String,
    plan: MealPlanDoc,
    json: Json = apiTestJson,
) {
    val response = putMealPlan(client, weekId, plan, json)
    assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
}
