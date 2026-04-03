package app.meals

import app.meals.domain.CreateUserRequest
import app.meals.domain.UserInfo
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class UserApiTest {

    private val json = apiTestJson

    @Test
    fun `POST users creates user and returns 201`() = testWithApp {
        val u = createUser(client, "newuser@test.com", "password1", "user", json)
        assertEquals("newuser@test.com", u.email)
        assertEquals("user", u.role)
        assertTrue(u.id.isNotBlank())
        assertTrue(u.familyId.isNotBlank())
    }

    @Test
    fun `POST users rejects duplicate email with 409`() = testWithApp {
        createUser(client, "dup@test.com", "pw", "user", json)
        val res = client.post("/api/users") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    CreateUserRequest.serializer(),
                    CreateUserRequest("dup@test.com", "other", "user"),
                ),
            )
        }
        assertEquals(HttpStatusCode.Conflict, res.status, res.bodyAsText())
    }

    @Test
    fun `POST users rejects blank email with 400`() = testWithApp {
        val res = client.post("/api/users") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    CreateUserRequest.serializer(),
                    CreateUserRequest("   ", "pw", "user"),
                ),
            )
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `POST users rejects blank password with 400`() = testWithApp {
        val res = client.post("/api/users") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    CreateUserRequest.serializer(),
                    CreateUserRequest("a@test.com", "   ", "user"),
                ),
            )
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `POST users normalizes unknown role to user`() = testWithApp {
        val res = client.post("/api/users") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    CreateUserRequest.serializer(),
                    CreateUserRequest("role@test.com", "pw", "superadmin"),
                ),
            )
        }
        assertEquals(HttpStatusCode.Created, res.status, res.bodyAsText())
        val u = json.decodeFromString(UserInfo.serializer(), res.bodyAsText())
        assertEquals("user", u.role)
    }

    @Test
    fun `POST users rejects non-admin caller with 403`() = testWithApp {
        val regular = createUser(client, "regular@test.com", "pw", "user", json)
        val res = client.post("/api/users") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor(regular.id, "user")}")
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    CreateUserRequest.serializer(),
                    CreateUserRequest("victim@test.com", "pw", "user"),
                ),
            )
        }
        assertEquals(HttpStatusCode.Forbidden, res.status, res.bodyAsText())
    }
}
