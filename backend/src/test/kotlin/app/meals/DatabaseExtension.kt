package app.meals

import org.junit.jupiter.api.extension.AfterAllCallback
import org.junit.jupiter.api.extension.BeforeAllCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtensionContext

/** Starts Testcontainers Postgres once per test class, resets schema before each test, stops container after class. */
class DatabaseExtension : BeforeAllCallback, AfterAllCallback, BeforeEachCallback {

    override fun beforeAll(context: ExtensionContext) {
        TestDatabase.startIfNeeded()
    }

    override fun afterAll(context: ExtensionContext) {
        TestDatabase.stopIfStarted()
    }

    override fun beforeEach(context: ExtensionContext) {
        TestDatabase.resetSchema()
    }
}
