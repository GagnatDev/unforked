package app.meals.storage

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.sql.PreparedStatement
import java.sql.ResultSet

private val json = Json { ignoreUnknownKeys = true }

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
    Json { ignoreUnknownKeys = true }.encodeToString(this)

inline fun <reified T : Any> String.fromJsonb(): T =
    Json { ignoreUnknownKeys = true }.decodeFromString<T>(this)
