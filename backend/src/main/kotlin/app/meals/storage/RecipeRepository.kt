package app.meals.storage

import app.meals.domain.RecipeDoc
import java.sql.Connection
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

    fun findAll(familyId: UUID, nameQuery: String? = null, tagQuery: String? = null): List<Pair<UUID, RecipeDoc>> {
        return DatabaseFactory.query { conn ->
            val sql = buildString {
                append("SELECT id, doc FROM recipes WHERE family_id = ? ")
                if (!nameQuery.isNullOrBlank()) append("AND doc->>'name' ILIKE ? ")
                // Use @> jsonb_build_array(?) instead of doc->'tags' ? tag: JDBC treats "?" as bind placeholders,
                // which breaks the jsonb "contains key/element" operator in prepared statements.
                if (!tagQuery.isNullOrBlank()) append("AND doc->'tags' @> jsonb_build_array(?) ")
                append("ORDER BY doc->>'name'")
            }
            conn.prepareStatement(sql).use { ps ->
                var i = 1
                ps.setObject(i++, familyId)
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

    fun findById(familyId: UUID, id: UUID): RecipeDoc? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT doc FROM recipes WHERE id = ? AND family_id = ?").use { ps ->
                ps.setObject(1, id)
                ps.setObject(2, familyId)
                ps.executeQuery().use { rs ->
                    if (rs.next()) rs.getJsonb("doc")?.fromJsonb() else null
                }
            }
        }
    }

    fun insert(familyId: UUID, doc: RecipeDoc): UUID {
        return DatabaseFactory.query { conn ->
            insert(conn, familyId, doc)
        }
    }

    fun insert(conn: Connection, familyId: UUID, doc: RecipeDoc): UUID {
        return conn.prepareStatement("INSERT INTO recipes (family_id, doc) VALUES (?, ?::jsonb) RETURNING id").use { ps ->
            ps.setObject(1, familyId)
            ps.setJsonb(2, doc.toJsonbString())
            ps.executeQuery().use { rs ->
                check(rs.next()) { "INSERT RETURNING id must return one row" }
                UUID.fromString(rs.getString("id"))
            }
        }
    }

    fun update(familyId: UUID, id: UUID, doc: RecipeDoc): Boolean {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "UPDATE recipes SET doc = ?::jsonb, updated_at = now() WHERE id = ? AND family_id = ?"
            ).use { ps ->
                ps.setJsonb(1, doc.toJsonbString())
                ps.setObject(2, id)
                ps.setObject(3, familyId)
                ps.executeUpdate() > 0
            }
        }
    }

    fun delete(familyId: UUID, id: UUID): Boolean {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("DELETE FROM recipes WHERE id = ? AND family_id = ?").use { ps ->
                ps.setObject(1, id)
                ps.setObject(2, familyId)
                ps.executeUpdate() > 0
            }
        }
    }

    fun suggestTags(familyId: UUID, prefix: String, excludeRecipeId: UUID?, limit: Int = 20): List<String> {
        val trimmed = prefix.trim()
        if (trimmed.isEmpty()) return emptyList()
        val pattern = "$trimmed%"
        return DatabaseFactory.query { conn ->
            val sql =
                """
                SELECT DISTINCT t.tag AS tag
                FROM recipes r
                CROSS JOIN LATERAL jsonb_array_elements_text(r.doc->'tags') AS t(tag)
                WHERE r.family_id = ?
                  AND (?::uuid IS NULL OR r.id <> ?::uuid)
                  AND t.tag ILIKE ?
                ORDER BY t.tag
                LIMIT ?
                """.trimIndent()
            conn.prepareStatement(sql).use { ps ->
                ps.setObject(1, familyId)
                if (excludeRecipeId == null) {
                    ps.setNull(2, Types.OTHER)
                    ps.setNull(3, Types.OTHER)
                } else {
                    ps.setObject(2, excludeRecipeId)
                    ps.setObject(3, excludeRecipeId)
                }
                ps.setString(4, pattern)
                ps.setInt(5, limit)
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

    fun findByIds(familyId: UUID, ids: List<UUID>): List<Pair<UUID, RecipeDoc>> {
        if (ids.isEmpty()) return emptyList()
        return DatabaseFactory.query { conn ->
            val placeholders = ids.joinToString(",") { "?" }
            conn.prepareStatement(
                "SELECT id, doc FROM recipes WHERE family_id = ? AND id IN ($placeholders)"
            ).use { ps ->
                var i = 1
                ps.setObject(i++, familyId)
                ids.forEach { id -> ps.setObject(i++, id) }
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

    fun moveAllToFamily(conn: Connection, fromFamilyId: UUID, toFamilyId: UUID): Int {
        conn.prepareStatement("UPDATE recipes SET family_id = ? WHERE family_id = ?").use { ps ->
            ps.setObject(1, toFamilyId)
            ps.setObject(2, fromFamilyId)
            return ps.executeUpdate()
        }
    }
}
