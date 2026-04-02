package app.meals.domain

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

@Serializable
data class RecipeResponse(val id: String, val doc: RecipeDoc)

@Serializable
data class Ingredient(
    val name: String,
    val quantity: String,
    val unit: String = ""
)

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class RecipeDoc(
    val name: String,
    val description: String = "",
    val sourceUrl: String? = null,
    val sourceName: String? = null,
    val ingredients: List<Ingredient> = emptyList(),
    val steps: List<String> = emptyList(),
    val servings: Int = 4,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val tags: List<String> = emptyList()
)
