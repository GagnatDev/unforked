package app.meals

import app.meals.auth.DevAuth
import app.meals.domain.LoginRequest
import app.meals.domain.LoginResponse
import app.meals.domain.RegisterWithInviteRequest
import app.meals.domain.SetupRequest
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class AuthApiTest {

    private val json = apiTestJson

    @Test
    fun `POST auth setup returns forbidden when users already exist`() = testWithApp {
        val res = client.post("/api/auth/setup") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SetupRequest.serializer(), SetupRequest("new@test.com", "password1")))
        }
        assertEquals(HttpStatusCode.Forbidden, res.status, res.bodyAsText())
    }

    @Test
    fun `POST auth setup succeeds on empty database`() = testWithApp {
        TestDatabase.resetSchemaWithoutSeed()
        val res = client.post("/api/auth/setup") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SetupRequest.serializer(), SetupRequest("first@admin.com", "secret12")))
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val body = json.decodeFromString(LoginResponse.serializer(), res.bodyAsText())
        assertTrue(body.token.isNotBlank())
        assertEquals("first@admin.com", body.user.email)
        assertEquals("admin", body.user.role)
    }

    @Test
    fun `POST auth login succeeds for seeded dev user`() = testWithApp {
        val res = client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(LoginRequest.serializer(), LoginRequest(DevAuth.EMAIL, "dev")))
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val body = json.decodeFromString(LoginResponse.serializer(), res.bodyAsText())
        assertEquals(DevAuth.EMAIL, body.user.email)
        assertEquals(DevAuth.USER_ID, body.user.id)
        assertTrue(body.token.isNotBlank())
    }

    @Test
    fun `POST auth login rejects wrong password`() = testWithApp {
        val res = client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(LoginRequest.serializer(), LoginRequest(DevAuth.EMAIL, "wrong-password")))
        }
        assertEquals(HttpStatusCode.Unauthorized, res.status, res.bodyAsText())
    }

    @Test
    fun `POST auth login rejects unknown email`() = testWithApp {
        val res = client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(LoginRequest.serializer(), LoginRequest("nobody@example.com", "x")))
        }
        assertEquals(HttpStatusCode.Unauthorized, res.status, res.bodyAsText())
    }

    @Test
    fun `POST auth login rejects blank email`() = testWithApp {
        val res = client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(LoginRequest.serializer(), LoginRequest("   ", "x")))
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `GET auth me returns current user when auth disabled`() = testWithApp {
        val res = client.get("/api/auth/me")
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val parsed = json.parseToJsonElement(res.bodyAsText()).jsonObject
        assertEquals(DevAuth.USER_ID, parsed["id"]!!.jsonPrimitive.content)
        assertEquals(DevAuth.EMAIL, parsed["email"]!!.jsonPrimitive.content)
        assertEquals("admin", parsed["role"]!!.jsonPrimitive.content)
        assertEquals(DevAuth.FAMILY_ID, parsed["familyId"]!!.jsonPrimitive.content)
    }

    @Test
    fun `POST auth register-invite succeeds for new user with valid token`() = testWithApp {
        val invite = createInvite(client, "fresh-invite@test.com", json)
        val res = client.post("/api/auth/register-invite") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    RegisterWithInviteRequest.serializer(),
                    RegisterWithInviteRequest(
                        token = invite.token,
                        email = "fresh-invite@test.com",
                        password = "pw12345678",
                    ),
                ),
            )
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val body = json.decodeFromString(LoginResponse.serializer(), res.bodyAsText())
        assertEquals("fresh-invite@test.com", body.user.email)
        assertEquals("user", body.user.role)
        assertTrue(body.token.isNotBlank())
    }
}
