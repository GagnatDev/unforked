package app.meals.auth

/**
 * Fixed UUIDs for auth-disabled mode (tests, local E2E). Seeded in [app.meals.TestDatabase] when APP_PROFILE=test.
 */
object DevAuth {
    const val USER_ID: String = "00000000-0000-4000-8000-000000000001"
    const val FAMILY_ID: String = "00000000-0000-4000-8000-0000000000f1"
    const val EMAIL: String = "dev@local.test"
}
