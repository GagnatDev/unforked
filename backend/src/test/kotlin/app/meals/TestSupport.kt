package app.meals

import com.typesafe.config.ConfigFactory
import io.ktor.server.config.HoconApplicationConfig
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.config.mergeWith
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication

/**
 * Runs the application test with a single configured module (no config-loaded modules).
 * Use this instead of [testApplication] so plugins are not installed twice.
 * Config is loaded from application.conf (env vars set by Gradle test task override defaults).
 * When tests set System properties DB_URL, DB_USER, DB_PASSWORD (e.g. for Testcontainers),
 * those override storage.db so the app uses the container.
 */
fun testWithApp(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
    environment {
        val baseConfig = if (System.getProperty("APP_PROFILE") == "test") {
            ConfigFactory.parseResources("application-test.conf").withFallback(ConfigFactory.load())
        } else {
            ConfigFactory.load()
        }
        val overrides = MapApplicationConfig().apply {
            put("ktor.application.modules", emptyList<String>())
            System.getProperty("DB_URL")?.let { put("storage.db.url", it) }
            System.getProperty("DB_USER")?.let { put("storage.db.user", it) }
            System.getProperty("DB_PASSWORD")?.let { put("storage.db.password", it) }
        }
        config = HoconApplicationConfig(baseConfig).mergeWith(overrides)
    }
    application { module() }
    block()
}
