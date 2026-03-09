package app.meals

import app.meals.plugins.configureAuthentication
import app.meals.plugins.configureCors
import app.meals.plugins.configureDatabase
import app.meals.plugins.configureRouting
import app.meals.plugins.configureSerialization
import app.meals.plugins.configureStatusPages
import app.meals.seed.seedTestRecipesIfEmpty
import io.ktor.server.application.*
import io.ktor.server.netty.EngineMain

fun main(args: Array<String>) {
    EngineMain.main(args)
}

fun Application.module() {
    configureSerialization()
    configureCors()
    configureStatusPages()
    configureAuthentication()
    configureDatabase()
    val seedEnv = (System.getenv("SEED_TEST_DATA") ?: System.getProperty("SEED_TEST_DATA"))?.lowercase() == "true"
    if (seedEnv) {
        seedTestRecipesIfEmpty()
    }
    configureRouting()
}
