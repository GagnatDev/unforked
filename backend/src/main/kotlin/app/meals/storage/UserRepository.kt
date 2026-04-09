package app.meals.storage

import java.sql.Connection
import java.util.UUID

data class UserRow(
    val id: UUID,
    val email: String,
    val passwordHash: String,
    val role: String,
    val familyId: UUID,
)

object UserRepository {
    fun count(): Long {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT COUNT(*) FROM users").use { ps ->
                ps.executeQuery().use { rs ->
                    rs.next()
                    rs.getLong(1)
                }
            }
        }
    }

    fun findByEmail(email: String): UserRow? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "SELECT id, email, password_hash, role, family_id FROM users WHERE email = ?"
            ).use { ps ->
                ps.setString(1, email)
                ps.executeQuery().use { rs ->
                    if (!rs.next()) null else mapRow(rs)
                }
            }
        }
    }

    fun findById(id: UUID): UserRow? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "SELECT id, email, password_hash, role, family_id FROM users WHERE id = ?"
            ).use { ps ->
                ps.setObject(1, id)
                ps.executeQuery().use { rs ->
                    if (!rs.next()) null else mapRow(rs)
                }
            }
        }
    }

    fun listByFamily(familyId: UUID): List<UserRow> {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "SELECT id, email, password_hash, role, family_id FROM users WHERE family_id = ? ORDER BY email"
            ).use { ps ->
                ps.setObject(1, familyId)
                ps.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) add(mapRow(rs))
                    }
                }
            }
        }
    }

    /**
     * Creates a new solo family and a user belonging to it.
     */
    fun insert(email: String, passwordHash: String, role: String): UUID {
        return DatabaseFactory.transaction { conn ->
            val familyId = FamilyRepository.insert(conn, 4)
            insertUser(conn, email, passwordHash, role, familyId)
        }
    }

    /**
     * Inserts a user into an existing family (e.g. invite acceptance for new account).
     */
    fun insertIntoFamily(email: String, passwordHash: String, role: String, familyId: UUID): UUID {
        return DatabaseFactory.query { conn ->
            insertUser(conn, email, passwordHash, role, familyId)
        }
    }

    fun insertUser(conn: Connection, email: String, passwordHash: String, role: String, familyId: UUID): UUID {
        return conn.prepareStatement(
            "INSERT INTO users (email, password_hash, role, family_id) VALUES (?, ?, ?, ?) RETURNING id"
        ).use { ps ->
            ps.setString(1, email)
            ps.setString(2, passwordHash)
            ps.setString(3, role)
            ps.setObject(4, familyId)
            ps.executeQuery().use { rs ->
                check(rs.next()) { "INSERT RETURNING id must return one row" }
                UUID.fromString(rs.getString("id"))
            }
        }
    }

    fun countUsersInFamily(familyId: UUID): Int {
        return DatabaseFactory.query { conn -> countUsersInFamilyConn(conn, familyId) }
    }

    fun countUsersInFamilyConn(conn: Connection, familyId: UUID): Int {
        return conn.prepareStatement("SELECT COUNT(*) FROM users WHERE family_id = ?").use { ps ->
            ps.setObject(1, familyId)
            ps.executeQuery().use { rs ->
                check(rs.next())
                rs.getInt(1)
            }
        }
    }

    fun updateFamilyIdConn(conn: Connection, userId: UUID, newFamilyId: UUID): Int {
        return conn.prepareStatement("UPDATE users SET family_id = ? WHERE id = ?").use { ps ->
            ps.setObject(1, newFamilyId)
            ps.setObject(2, userId)
            ps.executeUpdate()
        }
    }

    fun updateFamilyId(userId: UUID, newFamilyId: UUID): Boolean {
        return DatabaseFactory.query { conn ->
            updateFamilyIdConn(conn, userId, newFamilyId) > 0
        }
    }

    private fun mapRow(rs: java.sql.ResultSet): UserRow {
        return UserRow(
            id = UUID.fromString(rs.getString("id")),
            email = rs.getString("email"),
            passwordHash = rs.getString("password_hash"),
            role = rs.getString("role"),
            familyId = UUID.fromString(rs.getString("family_id")),
        )
    }
}
