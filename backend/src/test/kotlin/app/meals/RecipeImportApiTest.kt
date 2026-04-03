package app.meals

import app.meals.domain.ImportRecipeRequest
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.encodeToString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class RecipeImportApiTest {

    private val json = apiTestJson

    @Test
    fun `POST recipes import rejects loopback URL`() = testWithApp {
        val response = client.post("/api/recipes/import") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ImportRecipeRequest("http://127.0.0.1/")))
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `POST recipes import rejects non http scheme`() = testWithApp {
        val response = client.post("/api/recipes/import") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ImportRecipeRequest("file:///etc/passwd")))
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `POST recipes import rejects invalid URL`() = testWithApp {
        val response = client.post("/api/recipes/import") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ImportRecipeRequest("not-a-url")))
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }
}
