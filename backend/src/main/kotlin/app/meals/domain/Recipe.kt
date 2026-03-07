package app.meals.domain

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
data class RecipeDoc(
    val name: String,
    val description: String = "",
    val ingredients: List<Ingredient> = emptyList(),
    val steps: List<String> = emptyList(),
    val servings: Int = 4,
    val tags: List<String> = emptyList()
)
