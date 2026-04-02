package app.meals

import app.meals.plugins.configureAuthentication
import app.meals.plugins.requireJwtSecretConfiguredForProduction
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class JwtSecretValidationTest {

    @Test
    fun `requireJwtSecret rejects blank secret`() {
        assertThrows<IllegalStateException> {
            requireJwtSecretConfiguredForProduction("", "bundled")
        }
        assertThrows<IllegalStateException> {
            requireJwtSecretConfiguredForProduction("   ", "bundled")
        }
    }

    @Test
    fun `requireJwtSecret rejects when secret equals bundled default from config`() {
        assertThrows<IllegalStateException> {
            requireJwtSecretConfiguredForProduction("same-as-bundled", "same-as-bundled")
        }
    }

    @Test
    fun `requireJwtSecret accepts non-bundled secret`() {
        assertDoesNotThrow {
            requireJwtSecretConfiguredForProduction("real-secret", "bundled-default-value")
        }
    }

    @Test
    fun `configureAuthentication allows bundled default when auth disabled`() = testApplication {
        environment {
            config = MapApplicationConfig().apply {
                put("ktor.application.modules", emptyList<String>())
                put("auth.jwt.bundled-insecure-default", "test-bundled")
                put("auth.jwt.secret", "test-bundled")
                put("auth.jwt.issuer", "test-issuer")
                put("auth.jwt.audience", "test-audience")
                put("auth.disabled", "true")
            }
        }
        application { configureAuthentication() }
    }

    @Test
    fun `configureAuthentication fails when auth enabled and secret equals bundled default`() {
        assertThrows<IllegalStateException> {
            testApplication {
                environment {
                    config = MapApplicationConfig().apply {
                        put("ktor.application.modules", emptyList<String>())
                        put("auth.jwt.bundled-insecure-default", "test-bundled")
                        put("auth.jwt.secret", "test-bundled")
                        put("auth.jwt.issuer", "test-issuer")
                        put("auth.jwt.audience", "test-audience")
                        put("auth.disabled", "false")
                    }
                }
                application { configureAuthentication() }
            }
        }
    }
}
