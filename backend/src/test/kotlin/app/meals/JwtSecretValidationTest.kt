package app.meals

import app.meals.auth.INSECURE_JWT_SECRET_PLACEHOLDER
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
        assertThrows<IllegalStateException> { requireJwtSecretConfiguredForProduction("") }
        assertThrows<IllegalStateException> { requireJwtSecretConfiguredForProduction("   ") }
    }

    @Test
    fun `requireJwtSecret rejects placeholder`() {
        assertThrows<IllegalStateException> {
            requireJwtSecretConfiguredForProduction(INSECURE_JWT_SECRET_PLACEHOLDER)
        }
    }

    @Test
    fun `requireJwtSecret accepts non-placeholder`() {
        assertDoesNotThrow { requireJwtSecretConfiguredForProduction("test-secret-at-least-ok") }
    }

    @Test
    fun `configureAuthentication allows placeholder when auth disabled`() = testApplication {
        environment {
            config = MapApplicationConfig().apply {
                put("ktor.application.modules", emptyList<String>())
                put("auth.jwt.secret", INSECURE_JWT_SECRET_PLACEHOLDER)
                put("auth.jwt.issuer", "test-issuer")
                put("auth.jwt.audience", "test-audience")
                put("auth.disabled", "true")
            }
        }
        application { configureAuthentication() }
    }

    @Test
    fun `configureAuthentication fails when auth enabled and secret is placeholder`() {
        assertThrows<IllegalStateException> {
            testApplication {
                environment {
                    config = MapApplicationConfig().apply {
                        put("ktor.application.modules", emptyList<String>())
                        put("auth.jwt.secret", INSECURE_JWT_SECRET_PLACEHOLDER)
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
