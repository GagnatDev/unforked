package app.meals.domain

import kotlinx.serialization.Serializable

@Serializable
data class DayAssignment(
    val day: String,
    val recipeId: String,
    val recipeName: String,
    val persons: Int? = null,
)

@Serializable
data class MealPlanDoc(
    val weekIdentifier: String,
    val defaultPersons: Int? = null,
    val assignments: List<DayAssignment> = emptyList(),
)
