package app.meals.service

import app.meals.storage.DatabaseFactory
import app.meals.storage.FamilyInvitationRepository
import app.meals.storage.FamilyInvitationRepository.STATUS_PENDING
import app.meals.storage.FamilyInvitationRow
import app.meals.storage.FamilyRepository
import app.meals.storage.MealPlanRepository
import app.meals.storage.RecipeRepository
import app.meals.storage.UserRepository
import app.meals.storage.UserRow
import java.security.SecureRandom
import java.sql.Connection
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

object FamilyInviteService {
    const val MAX_MEMBERS: Int = 5
    private val inviteTtlDays: Long = 7L
    private val random = SecureRandom()

    fun generateToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    fun createPendingInvite(
        familyId: UUID,
        inviterUserId: UUID,
        inviteeEmail: String,
    ): Pair<String, Instant> {
        val normalized = inviteeEmail.trim().lowercase()
        val members = FamilyRepository.countUsersInFamily(familyId)
        val pending = FamilyInvitationRepository.countPendingForFamily(familyId)
        if (members + pending >= MAX_MEMBERS) {
            error("Family is full or has too many pending invitations")
        }
        if (UserRepository.listByFamily(familyId).any { it.email == normalized }) {
            error("User is already a member of this family")
        }
        val token = generateToken()
        val expiresAt = Instant.now().plus(inviteTtlDays, ChronoUnit.DAYS)
        DatabaseFactory.query { conn ->
            FamilyInvitationRepository.insert(conn, familyId, inviterUserId, normalized, token, expiresAt)
        }
        return token to expiresAt
    }

    private fun validatePendingInvite(
        conn: Connection,
        token: String,
        normalizedEmail: String,
        emailMismatchMessage: String,
    ): FamilyInvitationRow {
        val inv = FamilyInvitationRepository.findByTokenConn(conn, token)
            ?: error("Invalid or unknown invitation")
        if (inv.status != STATUS_PENDING) error("Invitation is no longer valid")
        if (inv.expiresAt.isBefore(Instant.now())) error("Invitation has expired")
        if (inv.inviteeEmail != normalizedEmail) error(emailMismatchMessage)
        return inv
    }

    fun acceptInviteForExistingUser(user: UserRow, token: String) {
        DatabaseFactory.transaction { conn ->
            val email = user.email.trim().lowercase()
            val inv = validatePendingInvite(
                conn,
                token,
                email,
                "This invitation was sent to a different email address",
            )
            if (user.familyId == inv.familyId) error("You already belong to this family")
            if (UserRepository.countUsersInFamilyConn(conn, user.familyId) != 1) {
                error("You can only join with this flow when you are the only member of your current family")
            }
            if (UserRepository.countUsersInFamilyConn(conn, inv.familyId) >= MAX_MEMBERS) {
                error("This family is already full")
            }
            RecipeRepository.moveAllToFamily(conn, user.familyId, inv.familyId)
            MealPlanRepository.deleteAllForFamily(conn, user.familyId)
            check(UserRepository.updateFamilyIdConn(conn, user.id, inv.familyId) == 1)
            FamilyInvitationRepository.markAccepted(conn, inv.id)
            FamilyRepository.deleteIfEmptyConn(conn, user.familyId)
        }
    }

    fun registerWithInvite(token: String, email: String, password: String): UUID {
        val normalized = email.trim().lowercase()
        return DatabaseFactory.transaction { conn ->
            val inv = validatePendingInvite(
                conn,
                token,
                normalized,
                "Email does not match this invitation",
            )
            if (UserRepository.findByEmail(normalized) != null) error("An account with this email already exists")
            if (UserRepository.countUsersInFamilyConn(conn, inv.familyId) >= MAX_MEMBERS) {
                error("This family is already full")
            }
            val hash = at.favre.lib.crypto.bcrypt.BCrypt.withDefaults().hashToString(12, password.toCharArray())
            val newUserId = UserRepository.insertUser(conn, normalized, hash, "user", inv.familyId)
            FamilyInvitationRepository.markAccepted(conn, inv.id)
            newUserId
        }
    }
}
