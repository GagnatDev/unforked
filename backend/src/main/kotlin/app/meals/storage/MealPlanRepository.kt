package app.meals.storage

import app.meals.domain.MealPlanDoc
import java.sql.Connection
import java.util.UUID

object MealPlanRepository {
    fun findByWeek(familyId: UUID, weekIdentifier: String): Pair<UUID, MealPlanDoc>? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "SELECT id, doc FROM meal_plans WHERE family_id = ? AND doc->>'weekIdentifier' = ?"
            ).use { ps ->
                ps.setObject(1, familyId)
                ps.setString(2, weekIdentifier)
                ps.executeQuery().use { rs ->
                    if (!rs.next()) {
                        null
                    } else {
                        val id = UUID.fromString(rs.getString("id"))
                        val docStr = rs.getJsonb("doc") ?: return@query null
                        id to docStr.fromJsonb<MealPlanDoc>()
                    }
                }
            }
        }
    }

    fun upsert(familyId: UUID, doc: MealPlanDoc): UUID {
        return DatabaseFactory.query { conn ->
            upsert(conn, familyId, doc)
        }
    }

    fun upsert(conn: Connection, familyId: UUID, doc: MealPlanDoc): UUID {
        val existing = findByWeekConn(conn, familyId, doc.weekIdentifier)
        if (existing != null) {
            conn.prepareStatement("UPDATE meal_plans SET doc = ?::jsonb, updated_at = now() WHERE id = ?").use { ps ->
                ps.setJsonb(1, doc.toJsonbString())
                ps.setObject(2, existing.first)
                ps.executeUpdate()
            }
            return existing.first
        }
        return conn.prepareStatement("INSERT INTO meal_plans (family_id, doc) VALUES (?, ?::jsonb) RETURNING id").use { ps ->
            ps.setObject(1, familyId)
            ps.setJsonb(2, doc.toJsonbString())
            ps.executeQuery().use { rs ->
                check(rs.next())
                UUID.fromString(rs.getString("id"))
            }
        }
    }

    private fun findByWeekConn(conn: Connection, familyId: UUID, weekIdentifier: String): Pair<UUID, MealPlanDoc>? {
        return conn.prepareStatement(
            "SELECT id, doc FROM meal_plans WHERE family_id = ? AND doc->>'weekIdentifier' = ?"
        ).use { ps ->
            ps.setObject(1, familyId)
            ps.setString(2, weekIdentifier)
            ps.executeQuery().use { rs ->
                if (!rs.next()) {
                    null
                } else {
                    val id = UUID.fromString(rs.getString("id"))
                    val docStr = rs.getJsonb("doc")
                    if (docStr == null) null
                    else id to docStr.fromJsonb<MealPlanDoc>()
                }
            }
        }
    }

    fun deleteAllForFamily(conn: Connection, familyId: UUID): Int {
        conn.prepareStatement("DELETE FROM meal_plans WHERE family_id = ?").use { ps ->
            ps.setObject(1, familyId)
            return ps.executeUpdate()
        }
    }
}
