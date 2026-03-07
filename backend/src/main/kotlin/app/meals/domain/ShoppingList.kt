package app.meals.domain

import kotlinx.serialization.Serializable

@Serializable
data class ShoppingListItem(
    val name: String,
    val quantity: String,
    val unit: String,
    val recipeIds: List<String> = emptyList()
)

@Serializable
data class ShoppingListDoc(
    val weekIdentifier: String,
    val items: List<ShoppingListItem>
)
