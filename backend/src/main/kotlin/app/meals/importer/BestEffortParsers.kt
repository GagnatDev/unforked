package app.meals.importer

import app.meals.domain.Ingredient
import app.meals.domain.RecipeDoc
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jsoup.nodes.Document

internal object BestEffortParsers {
    fun parse(doc: Document, json: Json, warnings: MutableList<String>): RecipeDoc {
        val jsonLdDoc = parseFromJsonLd(doc, json, warnings)
        if (jsonLdDoc != null) return jsonLdDoc

        val title = doc.selectFirst("meta[property=og:title]")?.attr("content")?.trim()
            ?: doc.title().trim().takeIf { it.isNotBlank() }
        val description = doc.selectFirst("meta[property=og:description]")?.attr("content")?.trim()
            ?: doc.selectFirst("meta[name=description]")?.attr("content")?.trim()
        return RecipeDoc(
            name = title ?: "",
            description = description ?: "",
            sourceName = doc.selectFirst("meta[property=og:site_name]")?.attr("content")?.trim(),
        )
    }

    private fun parseFromJsonLd(doc: Document, json: Json, warnings: MutableList<String>): RecipeDoc? {
        val scripts = doc.select("script[type=application/ld+json]")
        if (scripts.isEmpty()) return null

        val elements = buildList {
            for (s in scripts) {
                val raw = s.data().ifBlank { s.html() }.trim()
                if (raw.isBlank()) continue
                val parsed = runCatching { json.parseToJsonElement(raw) }.getOrNull()
                if (parsed != null) add(parsed)
            }
        }
        if (elements.isEmpty()) return null

        val recipeObjects = elements.flatMap { extractRecipeObjects(it) }
        val recipe = recipeObjects.firstOrNull() ?: return null

        val name = recipe["name"]?.asString()?.trim().orEmpty()
        val description = recipe["description"]?.asString()?.trim().orEmpty()
        val ingredients = recipe["recipeIngredient"]?.let { el ->
            fun splitLines(s: String): List<String> =
                s.lines().map { it.trim() }.filter { it.isNotBlank() }
            when (el) {
                is JsonArray ->
                    el.flatMap { item ->
                        item.asString()?.trim()?.takeIf { it.isNotBlank() }?.let { splitLines(it) }.orEmpty()
                    }
                else ->
                    el.asString()?.trim()?.takeIf { it.isNotBlank() }?.let { splitLines(it) }.orEmpty()
            }
        }.orEmpty()

        val instructions = recipe["recipeInstructions"]?.let { parseInstructions(it) }.orEmpty()
        val servings = recipe["recipeYield"]?.asString()?.let { parseFirstInt(it) }
        val sourceName = recipe["publisher"]?.asObject()?.get("name")?.asString()?.trim()

        val ingObjs = ingredients.map { IngredientLineParser.parseLine(it) }
        val steps = instructions.map { it.trim() }.filter { it.isNotBlank() }

        if (ingObjs.isEmpty()) warnings.add("JSON-LD present but no ingredients found.")
        if (steps.isEmpty()) warnings.add("JSON-LD present but no instructions found.")

        return RecipeDoc(
            name = name,
            description = description,
            ingredients = ingObjs,
            steps = steps,
            servings = servings ?: 4,
            sourceName = sourceName,
        )
    }

    private fun extractRecipeObjects(root: JsonElement): List<JsonObject> {
        return when (root) {
            is JsonObject -> {
                val direct = root.takeIf { it.isRecipeType() }?.let { listOf(it) }.orEmpty()
                val graph = root["@graph"]?.let { extractRecipeObjects(it) }.orEmpty()
                direct + graph
            }
            is JsonArray -> root.flatMap { extractRecipeObjects(it) }
            else -> emptyList()
        }
    }

    private fun JsonObject.isRecipeType(): Boolean {
        val type = this["@type"] ?: return false
        val types = when (type) {
            is JsonPrimitive -> listOf(type.content)
            is JsonArray -> type.mapNotNull { (it as? JsonPrimitive)?.content }
            else -> emptyList()
        }
        return types.any { it.equals("Recipe", ignoreCase = true) }
    }

    private fun parseInstructions(el: JsonElement): List<String> {
        return when (el) {
            is JsonPrimitive -> el.asString()?.split("\n")?.map { it.trim() } ?: emptyList()
            is JsonArray -> el.flatMap { parseInstructions(it) }
            is JsonObject -> {
                val text = el["text"]?.asString()
                if (!text.isNullOrBlank()) listOf(text) else emptyList()
            }
            else -> emptyList()
        }
    }

    private fun parseFirstInt(s: String): Int? {
        val m = Regex("(\\d+)").find(s) ?: return null
        return m.groupValues[1].toIntOrNull()
    }
}

private fun JsonElement.asString(): String? =
    (this as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonElement.asObject(): JsonObject? = this as? JsonObject

