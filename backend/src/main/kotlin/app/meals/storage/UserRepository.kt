package app.meals.storage

import java.util.UUID

data class UserRow(
    val id: UUID,
    val email: String,
    val passwordHash: String,
    val role: String
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
            conn.prepareStatement("SELECT id, email, password_hash, role FROM users WHERE email = ?").use { ps ->
                ps.setString(1, email)
                ps.executeQuery().use { rs ->
                    if (rs.next()) {
                        UserRow(
                            id = UUID.fromString(rs.getString("id")),
                            email = rs.getString("email"),
                            passwordHash = rs.getString("password_hash"),
                            role = rs.getString("role")
                        )
                    } else null
                }
            }
        }
    }

    fun findById(id: UUID): UserRow? {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement("SELECT id, email, password_hash, role FROM users WHERE id = ?").use { ps ->
                ps.setObject(1, id)
                ps.executeQuery().use { rs ->
                    if (rs.next()) {
                        UserRow(
                            id = UUID.fromString(rs.getString("id")),
                            email = rs.getString("email"),
                            passwordHash = rs.getString("password_hash"),
                            role = rs.getString("role")
                        )
                    } else null
                }
            }
        }
    }

    fun insert(email: String, passwordHash: String, role: String): UUID {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id"
            ).use { ps ->
                ps.setString(1, email)
                ps.setString(2, passwordHash)
                ps.setString(3, role)
                ps.executeQuery().use { rs ->
                    check(rs.next()) { "INSERT RETURNING id must return one row" }
                    UUID.fromString(rs.getString("id"))
                }
            }
        }
    }
}
