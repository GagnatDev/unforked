package app.meals

import app.meals.auth.DevAuth
import at.favre.lib.crypto.bcrypt.BCrypt
import org.flywaydb.core.Flyway
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.Instant

object TestDatabase {
    private val postgres = PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine"))
        .apply {
            withDatabaseName("meals")
            withUsername("meals")
            withPassword("meals")
        }

    @Volatile
    private var started = false

    @Synchronized
    fun startIfNeeded() {
        if (started) return
        postgres.start()
        System.setProperty("DB_URL", postgres.jdbcUrl)
        System.setProperty("DB_USER", postgres.username)
        System.setProperty("DB_PASSWORD", postgres.password)
        System.setProperty("APP_PROFILE", "test")
        started = true
    }

    fun resetSchema() {
        val url = System.getProperty("DB_URL") ?: error("DB_URL is not set")
        val user = System.getProperty("DB_USER") ?: error("DB_USER is not set")
        val password = System.getProperty("DB_PASSWORD") ?: error("DB_PASSWORD is not set")
        flywayCleanAndMigrate(url, user, password)
        seedDevPrincipalIfTest(url, user, password)
    }

    /**
     * Fresh schema with migrations only (no dev user). Use for [POST /api/auth/setup] success path.
     */
    fun resetSchemaWithoutSeed() {
        val url = System.getProperty("DB_URL") ?: error("DB_URL is not set")
        val user = System.getProperty("DB_USER") ?: error("DB_USER is not set")
        val password = System.getProperty("DB_PASSWORD") ?: error("DB_PASSWORD is not set")
        flywayCleanAndMigrate(url, user, password)
    }

    private fun flywayCleanAndMigrate(url: String, user: String, password: String) {
        Flyway.configure()
            .dataSource(url, user, password)
            .locations("classpath:db/migration")
            .cleanDisabled(false)
            .load()
            .clean()
        Flyway.configure()
            .dataSource(url, user, password)
            .locations("classpath:db/migration")
            .load()
            .migrate()
    }

    /** Test-only: mark invitation as expired so accept/register flows fail. */
    fun expireInvitationByTokenForTesting(token: String) {
        val url = System.getProperty("DB_URL") ?: error("DB_URL is not set")
        val user = System.getProperty("DB_USER") ?: error("DB_USER is not set")
        val password = System.getProperty("DB_PASSWORD") ?: error("DB_PASSWORD is not set")
        DriverManager.getConnection(url, user, password).use { conn ->
            conn.prepareStatement(
                "UPDATE family_invitations SET expires_at = ? WHERE token = ?"
            ).use { ps ->
                ps.setTimestamp(1, Timestamp.from(Instant.EPOCH))
                ps.setString(2, token)
                check(ps.executeUpdate() == 1) { "Expected one invitation row updated" }
            }
        }
    }

    /** Test-only: co-locate a second user in [targetFamilyId] (e.g. to violate "sole member" accept rule). */
    fun updateUserFamilyIdForTesting(userId: String, targetFamilyId: String) {
        val url = System.getProperty("DB_URL") ?: error("DB_URL is not set")
        val user = System.getProperty("DB_USER") ?: error("DB_USER is not set")
        val password = System.getProperty("DB_PASSWORD") ?: error("DB_PASSWORD is not set")
        DriverManager.getConnection(url, user, password).use { conn ->
            conn.prepareStatement(
                "UPDATE users SET family_id = ?::uuid WHERE id = ?::uuid"
            ).use { ps ->
                ps.setString(1, targetFamilyId)
                ps.setString(2, userId)
                check(ps.executeUpdate() == 1) { "Expected one user row updated" }
            }
        }
    }

    private fun seedDevPrincipalIfTest(url: String, user: String, password: String) {
        if (System.getProperty("APP_PROFILE") != "test") return
        val hash = BCrypt.withDefaults().hashToString(12, "dev".toCharArray())
        DriverManager.getConnection(url, user, password).use { conn ->
            conn.prepareStatement(
                """
                INSERT INTO families (id, default_meal_plan_persons)
                VALUES (?::uuid, 4)
                ON CONFLICT (id) DO NOTHING
                """.trimIndent()
            ).use { ps ->
                ps.setString(1, DevAuth.FAMILY_ID)
                ps.executeUpdate()
            }
            conn.prepareStatement(
                """
                INSERT INTO users (id, email, password_hash, role, family_id)
                VALUES (?::uuid, ?, ?, 'admin', ?::uuid)
                ON CONFLICT (id) DO NOTHING
                """.trimIndent()
            ).use { ps ->
                ps.setString(1, DevAuth.USER_ID)
                ps.setString(2, DevAuth.EMAIL)
                ps.setString(3, hash)
                ps.setString(4, DevAuth.FAMILY_ID)
                ps.executeUpdate()
            }
        }
    }

    @Synchronized
    fun stopIfStarted() {
        if (!started) return
        System.clearProperty("DB_URL")
        System.clearProperty("DB_USER")
        System.clearProperty("DB_PASSWORD")
        System.clearProperty("APP_PROFILE")
        postgres.stop()
        started = false
    }
}
