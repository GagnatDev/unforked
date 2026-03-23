package app.meals

import org.flywaydb.core.Flyway
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

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
