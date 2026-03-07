package app.meals

import app.meals.plugins.configureCors
import app.meals.plugins.configureDatabase
import app.meals.plugins.configureRouting
import app.meals.plugins.configureSerialization
import app.meals.plugins.configureStatusPages
import app.meals.seed.seedTestRecipesIfEmpty
import io.ktor.server.application.*
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main(args: Array<String>) {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port, host = "0.0.0.0") {
        module()
    }.start(wait = true)
}

fun Application.module() {
    configureSerialization()
    configureCors()
    configureStatusPages()
    configureDatabase()
    val seedEnv = (System.getenv("SEED_TEST_DATA") ?: System.getProperty("SEED_TEST_DATA"))?.lowercase() == "true"
    if (seedEnv) {
        seedTestRecipesIfEmpty()
    }
    configureRouting()
}
