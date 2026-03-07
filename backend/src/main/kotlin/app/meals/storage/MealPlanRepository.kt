package app.meals.storage

import app.meals.domain.MealPlanDoc
import java.util.UUID

object MealPlanRepository {
    fun findByWeek(weekIdentifier: String): Pair<UUID, MealPlanDoc>? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT id, doc FROM meal_plans WHERE doc->>'weekIdentifier' = ?").use { ps ->
                ps.setString(1, weekIdentifier)
                ps.executeQuery().use { rs ->
                    if (rs.next()) {
                        val id = UUID.fromString(rs.getString("id"))
                        val docStr = rs.getJsonb("doc") ?: return@query null
                        id to docStr.fromJsonb<MealPlanDoc>()
                    } else null
                }
            }
        }
    }

    fun upsert(doc: MealPlanDoc): UUID {
        return DatabaseFactory.query { conn ->
            val existing = findByWeek(doc.weekIdentifier)
            if (existing != null) {
                conn.prepareStatement("UPDATE meal_plans SET doc = ?::jsonb, updated_at = now() WHERE id = ?").use { ps ->
                    ps.setJsonb(1, doc.toJsonbString())
                    ps.setObject(2, existing.first)
                    ps.executeUpdate()
                }
                existing.first
            } else {
                conn.prepareStatement("INSERT INTO meal_plans (doc) VALUES (?::jsonb) RETURNING id").use { ps ->
                    ps.setJsonb(1, doc.toJsonbString())
                    ps.executeQuery().use { rs ->
                        rs.next()
                        UUID.fromString(rs.getString("id"))
                    }
                }
            }
        }
    }
}
