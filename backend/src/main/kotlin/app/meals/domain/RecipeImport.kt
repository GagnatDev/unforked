package app.meals.domain

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

@Serializable
data class ImportRecipeRequest(val url: String)

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class ImportRecipeResponse(
    val doc: RecipeDoc,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val warnings: List<String> = emptyList(),
)

