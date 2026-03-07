package app.meals

import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication

/**
 * Runs the application test with a single configured module (no config-loaded modules).
 * Use this instead of [testApplication] so plugins are not installed twice.
 */
fun testWithApp(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
    environment {
        config = MapApplicationConfig().apply { put("ktor.application.modules", emptyList()) }
    }
    application { module() }
    block()
}
