package app.meals.storage

import java.sql.Connection
import java.util.UUID

data class FamilyRow(
    val id: UUID,
    val defaultMealPlanPersons: Int,
)

object FamilyRepository {
    fun insert(conn: Connection, defaultMealPlanPersons: Int = 4): UUID {
        conn.prepareStatement(
            "INSERT INTO families (default_meal_plan_persons) VALUES (?) RETURNING id"
        ).use { ps ->
            ps.setInt(1, defaultMealPlanPersons)
            ps.executeQuery().use { rs ->
                check(rs.next()) { "INSERT family must return id" }
                return UUID.fromString(rs.getString("id"))
            }
        }
    }

    fun insert(defaultMealPlanPersons: Int = 4): UUID {
        return DatabaseFactory.transaction { conn -> insert(conn, defaultMealPlanPersons) }
    }

    fun findById(id: UUID): FamilyRow? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "SELECT id, default_meal_plan_persons FROM families WHERE id = ?"
            ).use { ps ->
                ps.setObject(1, id)
                ps.executeQuery().use { rs ->
                    if (!rs.next()) return@query null
                    FamilyRow(
                        id = UUID.fromString(rs.getString("id")),
                        defaultMealPlanPersons = rs.getInt("default_meal_plan_persons"),
                    )
                }
            }
        }
    }

    fun updateDefaultMealPlanPersons(id: UUID, value: Int): Boolean {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "UPDATE families SET default_meal_plan_persons = ? WHERE id = ?"
            ).use { ps ->
                ps.setInt(1, value)
                ps.setObject(2, id)
                ps.executeUpdate() > 0
            }
        }
    }

    fun deleteIfEmpty(familyId: UUID): Boolean {
        return DatabaseFactory.transaction { conn ->
            if (UserRepository.countUsersInFamilyConn(conn, familyId) > 0) return@transaction false
            conn.prepareStatement("DELETE FROM families WHERE id = ?").use { ps ->
                ps.setObject(1, familyId)
                ps.executeUpdate() > 0
            }
        }
    }

    fun deleteIfEmptyConn(conn: Connection, familyId: UUID): Boolean {
        if (UserRepository.countUsersInFamilyConn(conn, familyId) > 0) return false
        conn.prepareStatement("DELETE FROM families WHERE id = ?").use { ps ->
            ps.setObject(1, familyId)
            return ps.executeUpdate() > 0
        }
    }

    /** First family by created_at — used for seeding when DB has no recipes yet. */
    fun findFirstFamilyId(): UUID? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT id FROM families ORDER BY created_at ASC LIMIT 1").use { ps ->
                ps.executeQuery().use { rs ->
                    if (!rs.next()) null else UUID.fromString(rs.getString("id"))
                }
            }
        }
    }
}
