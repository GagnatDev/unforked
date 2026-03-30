package app.meals.storage

import java.sql.Connection
import java.time.Instant
import java.util.UUID

data class FamilyInvitationRow(
    val id: UUID,
    val familyId: UUID,
    val inviterUserId: UUID,
    val inviteeEmail: String,
    val token: String,
    val status: String,
    val expiresAt: Instant,
)

object FamilyInvitationRepository {
    const val STATUS_PENDING = "pending"
    const val STATUS_ACCEPTED = "accepted"

    fun insert(
        conn: Connection,
        familyId: UUID,
        inviterUserId: UUID,
        inviteeEmail: String,
        token: String,
        expiresAt: Instant,
    ): UUID {
        conn.prepareStatement(
            """
            INSERT INTO family_invitations (family_id, inviter_user_id, invitee_email, token, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id
            """.trimIndent()
        ).use { ps ->
            ps.setObject(1, familyId)
            ps.setObject(2, inviterUserId)
            ps.setString(3, inviteeEmail)
            ps.setString(4, token)
            ps.setString(5, STATUS_PENDING)
            ps.setObject(6, java.sql.Timestamp.from(expiresAt))
            return ps.executeQuery().use { rs ->
                check(rs.next())
                UUID.fromString(rs.getString("id"))
            }
        }
    }

    fun findByToken(token: String): FamilyInvitationRow? {
        return DatabaseFactory.query { conn -> findByTokenConn(conn, token) }
    }

    fun findByTokenConn(conn: Connection, token: String): FamilyInvitationRow? {
        return conn.prepareStatement(
            """
            SELECT id, family_id, inviter_user_id, invitee_email, token, status, expires_at
            FROM family_invitations WHERE token = ?
            """.trimIndent()
        ).use { ps ->
            ps.setString(1, token)
            ps.executeQuery().use { rs ->
                if (!rs.next()) null
                else mapRow(rs)
            }
        }
    }

    fun listPendingForFamily(familyId: UUID): List<FamilyInvitationRow> {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                """
                SELECT id, family_id, inviter_user_id, invitee_email, token, status, expires_at
                FROM family_invitations
                WHERE family_id = ? AND status = ?
                ORDER BY created_at DESC
                """.trimIndent()
            ).use { ps ->
                ps.setObject(1, familyId)
                ps.setString(2, STATUS_PENDING)
                ps.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) add(mapRow(rs))
                    }
                }
            }
        }
    }

    fun countPendingForFamily(familyId: UUID): Int {
        return DatabaseFactory.query { conn ->
            conn.prepareStatement(
                """
                SELECT COUNT(*) FROM family_invitations
                WHERE family_id = ? AND status = ? AND expires_at > now()
                """.trimIndent()
            ).use { ps ->
                ps.setObject(1, familyId)
                ps.setString(2, STATUS_PENDING)
                ps.executeQuery().use { rs ->
                    check(rs.next())
                    rs.getInt(1)
                }
            }
        }
    }

    fun markAccepted(conn: Connection, id: UUID): Boolean {
        conn.prepareStatement(
            "UPDATE family_invitations SET status = ? WHERE id = ? AND status = ?"
        ).use { ps ->
            ps.setString(1, STATUS_ACCEPTED)
            ps.setObject(2, id)
            ps.setString(3, STATUS_PENDING)
            return ps.executeUpdate() > 0
        }
    }

    private fun mapRow(rs: java.sql.ResultSet): FamilyInvitationRow {
        return FamilyInvitationRow(
            id = UUID.fromString(rs.getString("id")),
            familyId = UUID.fromString(rs.getString("family_id")),
            inviterUserId = UUID.fromString(rs.getString("inviter_user_id")),
            inviteeEmail = rs.getString("invitee_email"),
            token = rs.getString("token"),
            status = rs.getString("status"),
            expiresAt = rs.getTimestamp("expires_at").toInstant(),
        )
    }
}
