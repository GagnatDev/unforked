package app.meals

import app.meals.auth.DevAuth
import app.meals.domain.CreateFamilyInviteResponse
import app.meals.domain.RegisterWithInviteRequest
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class FamilyInviteApiTest {

    private val json = apiTestJson

    @Test
    fun `POST family invites rejects blank email`() = testWithApp {
        val res = postFamilyInvite(client, "   ", json)
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `POST family invites rejects email of existing family member`() = testWithApp {
        val res = postFamilyInvite(client, DevAuth.EMAIL, json)
        assertEquals(HttpStatusCode.Conflict, res.status, res.bodyAsText())
    }

    @Test
    fun `POST family invites returns token and expiry`() = testWithApp {
        val invite = createInvite(client, "invitee@test.com", json)
        assertTrue(invite.token.isNotBlank())
        assertTrue(invite.expiresAt.isNotBlank())
    }

    @Test
    fun `POST family invites accept rejects blank token`() = testWithApp {
        val res = postAcceptFamilyInvite(client, "   ", bearerToken = null, json)
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `POST family invites accept rejects unknown token`() = testWithApp {
        val res = postAcceptFamilyInvite(
            client,
            "a".repeat(64),
            bearerToken = null,
            json,
        )
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `POST family invites accept rejects email mismatch`() = testWithApp {
        val joiner = createUser(client, "joiner@test.com", "pw", "user", json)
        val joinerToken = tokenFor(joiner.id, "user")
        val inviteRes = postFamilyInvite(client, "other-person@test.com", json)
        assertEquals(HttpStatusCode.OK, inviteRes.status, inviteRes.bodyAsText())
        val inviteForOther = json.decodeFromString(
            CreateFamilyInviteResponse.serializer(),
            inviteRes.bodyAsText(),
        )
        val res = postAcceptFamilyInvite(client, inviteForOther.token, joinerToken, json)
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
        assertTrue(res.bodyAsText().contains("different email", ignoreCase = true))
    }

    @Test
    fun `POST family invites accept rejects when user is not sole member of current family`() = testWithApp {
        val joiner = createUser(client, "joiner@test.com", "pw", "user", json)
        val shadow = createUser(client, "shadow@test.com", "pw", "user", json)
        TestDatabase.updateUserFamilyIdForTesting(shadow.id, joiner.familyId)
        val inv = createInvite(client, "joiner@test.com", json)
        val res = postAcceptFamilyInvite(client, inv.token, tokenFor(joiner.id, "user"), json)
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
        assertTrue(res.bodyAsText().contains("only member", ignoreCase = true))
    }

    @Test
    fun `POST family invites returns conflict when family has too many pending invitations`() = testWithApp {
        repeat(4) { i ->
            assertEquals(
                HttpStatusCode.OK,
                postFamilyInvite(client, "pending$i@test.com", json).status,
            )
        }
        val fifth = postFamilyInvite(client, "pending-fifth@test.com", json)
        assertEquals(HttpStatusCode.Conflict, fifth.status, fifth.bodyAsText())
    }

    @Test
    fun `POST auth register-invite rejects expired invitation`() = testWithApp {
        val invite = createInvite(client, "newbie@test.com", json)
        TestDatabase.expireInvitationByTokenForTesting(invite.token)
        val res = client.post("/api/auth/register-invite") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    RegisterWithInviteRequest.serializer(),
                    RegisterWithInviteRequest(
                        token = invite.token,
                        email = "newbie@test.com",
                        password = "pw12345678",
                    ),
                ),
            )
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
        assertTrue(res.bodyAsText().contains("expired", ignoreCase = true))
    }

    @Test
    fun `POST auth register-invite rejects email mismatch`() = testWithApp {
        val invite = createInvite(client, "right@test.com", json)
        val res = client.post("/api/auth/register-invite") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    RegisterWithInviteRequest.serializer(),
                    RegisterWithInviteRequest(
                        token = invite.token,
                        email = "wrong@test.com",
                        password = "pw12345678",
                    ),
                ),
            )
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
    }

    @Test
    fun `POST auth register-invite rejects when email already registered`() = testWithApp {
        createUser(client, "taken@test.com", "pw", "user", json)
        val invite = createInvite(client, "taken@test.com", json)
        val res = client.post("/api/auth/register-invite") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    RegisterWithInviteRequest.serializer(),
                    RegisterWithInviteRequest(
                        token = invite.token,
                        email = "taken@test.com",
                        password = "pw12345678",
                    ),
                ),
            )
        }
        assertEquals(HttpStatusCode.BadRequest, res.status, res.bodyAsText())
        assertTrue(res.bodyAsText().contains("already exists", ignoreCase = true))
    }
}
