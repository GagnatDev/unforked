package app.meals.domain

import kotlinx.serialization.Serializable

@Serializable
data class DayAssignment(
    val day: String,
    val recipeId: String,
    val recipeName: String
)

@Serializable
data class MealPlanDoc(
    val weekIdentifier: String,
    val assignments: List<DayAssignment> = emptyList()
)
