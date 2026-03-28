package app.meals.storage

import app.meals.domain.RecipeDoc
import java.sql.Types
import java.util.UUID

object RecipeRepository {
    fun count(): Long {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT COUNT(*) FROM recipes").use { ps ->
                ps.executeQuery().use { rs ->
                    rs.next()
                    rs.getLong(1)
                }
            }
        }
    }

    fun findAll(nameQuery: String? = null, tagQuery: String? = null): List<Pair<UUID, RecipeDoc>> {
        return DatabaseFactory.query { conn ->
            val sql = buildString {
                append("SELECT id, doc FROM recipes WHERE 1=1 ")
                if (!nameQuery.isNullOrBlank()) append("AND doc->>'name' ILIKE ? ")
                if (!tagQuery.isNullOrBlank()) append("AND doc->'tags' ? ? ")
                append("ORDER BY doc->>'name'")
            }
            conn.prepareStatement(sql).use { ps ->
                var i = 1
                if (!nameQuery.isNullOrBlank()) ps.setString(i++, "%$nameQuery%")
                if (!tagQuery.isNullOrBlank()) ps.setString(i, tagQuery)
                ps.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            val id = UUID.fromString(rs.getString("id"))
                            val docStr = rs.getJsonb("doc") ?: continue
                            add(id to docStr.fromJsonb<RecipeDoc>())
                        }
                    }
                }
            }
        }
    }

    fun findById(id: UUID): RecipeDoc? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT doc FROM recipes WHERE id = ?").use { ps ->
                ps.setObject(1, id)
                ps.executeQuery().use { rs ->
                    if (rs.next()) rs.getJsonb("doc")?.fromJsonb() else null
                }
            }
        }
    }

    fun insert(doc: RecipeDoc): UUID {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("INSERT INTO recipes (doc) VALUES (?::jsonb) RETURNING id")
                .use { ps ->
                    ps.setJsonb(1, doc.toJsonbString())
                    ps.executeQuery().use { rs ->
                        check(rs.next()) { "INSERT RETURNING id must return one row" }
                        UUID.fromString(rs.getString("id"))
                    }
                }
        }
    }

    fun update(id: UUID, doc: RecipeDoc): Boolean {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("UPDATE recipes SET doc = ?::jsonb, updated_at = now() WHERE id = ?").use { ps ->
                ps.setJsonb(1, doc.toJsonbString())
                ps.setObject(2, id)
                ps.executeUpdate() > 0
            }
        }
    }

    fun delete(id: UUID): Boolean {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("DELETE FROM recipes WHERE id = ?").use { ps ->
                ps.setObject(1, id)
                ps.executeUpdate() > 0
            }
        }
    }

    /**
     * Distinct tags matching [prefix] (case-insensitive).
     * When [excludeRecipeId] is set, only tags from other recipes are considered.
     * Empty [prefix] (after trim) should be handled by the caller (return empty list without querying).
     */
    fun suggestTags(prefix: String, excludeRecipeId: UUID?, limit: Int = 20): List<String> {
        val trimmed = prefix.trim()
        if (trimmed.isEmpty()) return emptyList()
        val pattern = "$trimmed%"
        return DatabaseFactory.query { conn ->
            val sql =
                """
                SELECT DISTINCT t.tag AS tag
                FROM recipes r
                CROSS JOIN LATERAL jsonb_array_elements_text(r.doc->'tags') AS t(tag)
                WHERE (?::uuid IS NULL OR r.id <> ?::uuid)
                  AND t.tag ILIKE ?
                ORDER BY t.tag
                LIMIT ?
                """.trimIndent()
            conn.prepareStatement(sql).use { ps ->
                if (excludeRecipeId == null) {
                    ps.setNull(1, Types.OTHER)
                    ps.setNull(2, Types.OTHER)
                } else {
                    ps.setObject(1, excludeRecipeId)
                    ps.setObject(2, excludeRecipeId)
                }
                ps.setString(3, pattern)
                ps.setInt(4, limit)
                ps.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            add(rs.getString("tag"))
                        }
                    }
                }
            }
        }
    }

    fun findByIds(ids: List<UUID>): List<Pair<UUID, RecipeDoc>> {
        if (ids.isEmpty()) return emptyList()
        return DatabaseFactory.query { conn ->
            val placeholders = ids.joinToString(",") { "?" }
            conn.prepareStatement("SELECT id, doc FROM recipes WHERE id IN ($placeholders)").use { ps ->
                ids.forEachIndexed { i, id -> ps.setObject(i + 1, id) }
                ps.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            val id = UUID.fromString(rs.getString("id"))
                            val docStr = rs.getJsonb("doc") ?: continue
                            add(id to docStr.fromJsonb<RecipeDoc>())
                        }
                    }
                }
            }
        }
    }
}
