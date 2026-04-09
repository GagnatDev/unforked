package app.meals

import app.meals.domain.Ingredient
import app.meals.domain.RecipeDoc
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

@ExtendWith(DatabaseExtension::class)
class RecipeApiTest {

    private val json = apiTestJson

    @Test
    fun `GET recipes returns ok and JSON array`() = testWithApp {
        val response = client.get("/api/recipes")
        assertEquals(HttpStatusCode.OK, response.status)
        val list = json.decodeFromString<List<kotlinx.serialization.json.JsonObject>>(response.bodyAsText())
        assertTrue(list.size >= 0, "Response must be a valid JSON array")
    }

    @Test
    fun `POST recipe creates and GET returns it`() = testWithApp {
        val id = createRecipe(
            client,
            RecipeDoc(
                name = "Test Soup",
                description = "A test",
                ingredients = emptyList(),
                steps = listOf("Step 1"),
                servings = 2,
                tags = listOf("easy"),
            ),
            json,
        )
        val getResponse = client.get("/api/recipes/$id")
        assertEquals(HttpStatusCode.OK, getResponse.status)
        assertTrue(getResponse.bodyAsText().contains("Test Soup"))
    }

    @Test
    fun `POST recipe without tags returns tags as empty array`() = testWithApp {
        val id = createRecipe(
            client,
            minimalRecipe("No Tag Recipe").copy(description = "No tags provided"),
            json,
        )
        val getResponse = client.get("/api/recipes/$id")
        assertEquals(HttpStatusCode.OK, getResponse.status)
        val doc = json.parseToJsonElement(getResponse.bodyAsText()).jsonObject["doc"]!!.jsonObject
        assertTrue(doc.containsKey("tags"), "Response doc must include tags field")
        assertEquals(0, doc["tags"]!!.jsonArray.size, "tags must be an empty array when omitted by user")
    }

    @Test
    fun `health returns ok`() = testWithApp {
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains("ok"))
    }

    @Test
    fun `GET recipes tags with empty q returns empty array`() = testWithApp {
        val response = client.get("/api/recipes/tags")
        assertEquals(HttpStatusCode.OK, response.status)
        val list = json.decodeFromString(ListSerializer(String.serializer()), response.bodyAsText())
        assertEquals(0, list.size)
    }

    @Test
    fun `GET recipes tags returns distinct tags matching prefix from other recipes`() = testWithApp {
        val r1 = RecipeDoc(
            name = "R1",
            description = "",
            ingredients = emptyList(),
            steps = emptyList(),
            servings = 2,
            tags = listOf("vegetarian", "quick"),
        )
        val r2 = RecipeDoc(
            name = "R2",
            description = "",
            ingredients = emptyList(),
            steps = emptyList(),
            servings = 2,
            tags = listOf("VEGetarian", "dinner"),
        )
        val id1 = createRecipe(client, r1, json)
        createRecipe(client, r2, json)

        val veg = client.get("/api/recipes/tags?q=veg")
        assertEquals(HttpStatusCode.OK, veg.status)
        val vegTags = json.decodeFromString(ListSerializer(String.serializer()), veg.bodyAsText())
        assertEquals(2, vegTags.size)
        assertTrue("vegetarian" in vegTags && "VEGetarian" in vegTags)

        val exclude = client.get("/api/recipes/tags?q=veg&excludeRecipeId=$id1")
        val excludeTags = json.decodeFromString(ListSerializer(String.serializer()), exclude.bodyAsText())
        assertEquals(listOf("VEGetarian"), excludeTags)
    }

    @Test
    fun `PUT recipe updates and GET returns updated`() = testWithApp {
        val id = createRecipe(
            client,
            minimalRecipe("Soup", tags = listOf("easy")).copy(description = "old"),
            json,
        )
        val updated = RecipeDoc(
            name = "Chowder",
            description = "new",
            ingredients = listOf(Ingredient("water", "1", "l")),
            steps = listOf("Boil"),
            servings = 3,
            tags = listOf("hearty"),
        )
        val putRes = client.put("/api/recipes/$id") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RecipeDoc.serializer(), updated))
        }
        assertEquals(HttpStatusCode.OK, putRes.status, putRes.bodyAsText())
        val getRes = client.get("/api/recipes/$id")
        assertEquals(HttpStatusCode.OK, getRes.status)
        val doc = json.parseToJsonElement(getRes.bodyAsText()).jsonObject["doc"]!!.jsonObject
        assertEquals("Chowder", doc["name"]!!.jsonPrimitive.content)
        assertEquals("new", doc["description"]!!.jsonPrimitive.content)
        assertEquals(3, doc["servings"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun `PUT recipe returns 404 for nonexistent ID`() = testWithApp {
        val body = minimalRecipe("X").copy(servings = 1)
        val putRes = client.put("/api/recipes/$NONEXISTENT_UUID") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RecipeDoc.serializer(), body))
        }
        assertEquals(HttpStatusCode.NotFound, putRes.status)
    }

    @Test
    fun `PUT recipe returns 400 for invalid UUID`() = testWithApp {
        val body = minimalRecipe("X").copy(servings = 1)
        val putRes = client.put("/api/recipes/not-a-uuid") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RecipeDoc.serializer(), body))
        }
        assertEquals(HttpStatusCode.BadRequest, putRes.status)
    }

    @Test
    fun `DELETE recipe returns 204 and GET returns 404`() = testWithApp {
        val id = createRecipe(client, minimalRecipe("Gone"), json)
        val del = client.delete("/api/recipes/$id")
        assertEquals(HttpStatusCode.NoContent, del.status)
        val getRes = client.get("/api/recipes/$id")
        assertEquals(HttpStatusCode.NotFound, getRes.status)
    }

    @Test
    fun `DELETE recipe returns 404 for nonexistent ID`() = testWithApp {
        val del = client.delete("/api/recipes/$NONEXISTENT_UUID")
        assertEquals(HttpStatusCode.NotFound, del.status)
    }

    @Test
    fun `DELETE recipe returns 400 for malformed UUID`() = testWithApp {
        val del = client.delete("/api/recipes/not-a-uuid")
        assertEquals(HttpStatusCode.BadRequest, del.status)
    }

    @Test
    fun `GET recipe returns 404 for nonexistent ID`() = testWithApp {
        val getRes = client.get("/api/recipes/$NONEXISTENT_UUID")
        assertEquals(HttpStatusCode.NotFound, getRes.status)
    }

    @Test
    fun `GET recipe returns 400 for malformed UUID`() = testWithApp {
        val getRes = client.get("/api/recipes/not-a-uuid")
        assertEquals(HttpStatusCode.BadRequest, getRes.status)
    }

    @Test
    fun `GET recipes filters by name query parameter`() = testWithApp {
        createRecipe(client, minimalRecipe("Tomato Soup"), json)
        createRecipe(client, minimalRecipe("Green Salad"), json)
        val response = client.get("/api/recipes?name=soup")
        assertEquals(HttpStatusCode.OK, response.status)
        val arr = json.parseToJsonElement(response.bodyAsText()).jsonArray
        assertEquals(1, arr.size)
        assertTrue(arr[0].jsonObject["doc"]!!.jsonObject["name"]!!.jsonPrimitive.content.contains("Soup", ignoreCase = true))
    }

    @Test
    fun `GET recipes filters by tag query parameter`() = testWithApp {
        createRecipe(client, minimalRecipe("A", tags = listOf("easy")), json)
        createRecipe(client, minimalRecipe("B", tags = listOf("hard")), json)
        val response = client.get("/api/recipes?tag=easy")
        assertEquals(HttpStatusCode.OK, response.status)
        val arr = json.parseToJsonElement(response.bodyAsText()).jsonArray
        assertEquals(1, arr.size)
        assertEquals("A", arr[0].jsonObject["doc"]!!.jsonObject["name"]!!.jsonPrimitive.content)
    }
}
