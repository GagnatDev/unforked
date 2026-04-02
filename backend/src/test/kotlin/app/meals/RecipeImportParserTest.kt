package app.meals

import app.meals.importer.BestEffortParsers
import kotlinx.serialization.json.Json
import org.jsoup.Jsoup
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RecipeImportParserTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `fixture without json-ld falls back to document title`() {
        val html = resourceText("importer/import-fixture-grove-pannekaker.html")
        val doc = Jsoup.parse(html, "https://example.com/recipes/grove-pannekaker")
        val warnings = mutableListOf<String>()
        val out = BestEffortParsers.parse(doc, json, warnings)

        assertTrue(out.name.contains("Grove pannekaker", ignoreCase = true))
    }

    @Test
    fun `second fixture without json-ld uses title`() {
        val html = resourceText("importer/import-fixture-lange-kikertsalat.html")
        val doc = Jsoup.parse(html, "https://example.com/recipes/lange-kikertsalat")
        val warnings = mutableListOf<String>()
        val out = BestEffortParsers.parse(doc, json, warnings)

        assertTrue(out.name.contains("Lange", ignoreCase = true))
    }

    @Test
    fun `third fixture without json-ld uses title`() {
        val html = resourceText("importer/import-fixture-birria-taco.html")
        val doc = Jsoup.parse(html, "https://example.com/recipes/birria-taco")
        val warnings = mutableListOf<String>()
        val out = BestEffortParsers.parse(doc, json, warnings)

        assertTrue(out.name.contains("Birria", ignoreCase = true))
    }

    @Test
    fun `json-ld recipe extracts fields`() {
        val html = resourceText("importer/jsonld-recipe-only.html")
        val doc = Jsoup.parse(html, "https://example.com/recipes/soup")
        val warnings = mutableListOf<String>()
        val out = BestEffortParsers.parse(doc, json, warnings)

        assertTrue(out.name.contains("JSON-LD Test Soup"))
        assertTrue(out.ingredients.size >= 2)
        assertTrue(out.steps.size >= 2)
        assertTrue(out.servings == 4)
        assertTrue(out.ingredients[0].quantity == "200" && out.ingredients[0].unit == "g" && out.ingredients[0].name == "carrots")
        assertTrue(out.ingredients[1].quantity == "1" && out.ingredients[1].unit == "l" && out.ingredients[1].name == "water")
    }

    @Test
    fun `json-ld recipeIngredient as single string splits on newlines`() {
        val html =
            """
            <!DOCTYPE html><html><head>
            <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Recipe","name":"Multiline","recipeIngredient":"1 dl milk\n200 g flour"}
            </script></head><body></body></html>
            """.trimIndent()
        val doc = Jsoup.parse(html, "https://example.com/r")
        val warnings = mutableListOf<String>()
        val out = BestEffortParsers.parse(doc, json, warnings)
        assertTrue(out.ingredients.size == 2)
        assertTrue(out.ingredients[0].quantity == "1" && out.ingredients[0].unit == "dl" && out.ingredients[0].name == "milk")
        assertTrue(out.ingredients[1].quantity == "200" && out.ingredients[1].unit == "g" && out.ingredients[1].name == "flour")
    }

    private fun resourceText(path: String): String =
        checkNotNull(javaClass.classLoader.getResource(path)) { "missing test resource: $path" }.readText(Charsets.UTF_8)
}
