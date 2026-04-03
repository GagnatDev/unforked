package app.meals.storage

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.sql.PreparedStatement
import java.sql.ResultSet

@PublishedApi
internal val json = Json { ignoreUnknownKeys = true }

fun PreparedStatement.setJsonb(index: Int, value: String) {
    val pgObject = org.postgresql.util.PGobject().apply {
        type = "jsonb"
        this.value = value
    }
    setObject(index, pgObject)
}

fun ResultSet.getJsonb(columnLabel: String): String? {
    val obj = getObject(columnLabel) ?: return null
    return when (obj) {
        is org.postgresql.util.PGobject -> obj.value
        is String -> obj
        else -> obj.toString()
    }
}

inline fun <reified T : Any> T.toJsonbString(): String =
    json.encodeToString(this)

inline fun <reified T : Any> String.fromJsonb(): T =
    json.decodeFromString<T>(this)
