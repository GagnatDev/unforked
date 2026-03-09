package app.meals

import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication

/**
 * Runs the application test with a single configured module (no config-loaded modules).
 * Use this instead of [testApplication] so plugins are not installed twice.
 * Auth config is filled from env vars (set by Gradle test task) so it matches application.conf behaviour.
 */
fun testWithApp(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
    environment {
        config = MapApplicationConfig().apply {
            put("ktor.application.modules", emptyList())
            put("auth.jwt.secret", System.getenv("JWT_SECRET") ?: "test-secret")
            put("auth.jwt.issuer", System.getenv("JWT_ISSUER") ?: "test-issuer")
            put("auth.jwt.audience", System.getenv("JWT_AUDIENCE") ?: "test-audience")
            put("auth.disabled", System.getenv("DISABLE_AUTH") ?: "true")
        }
    }
    application { module() }
    block()
}
