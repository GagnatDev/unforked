package app.meals.plugins

import app.meals.storage.DatabaseFactory
import io.ktor.server.application.*

fun Application.configureDatabase() {
    val dbUrl = environment.config.property("storage.db.url").getString()
    val dbUser = environment.config.property("storage.db.user").getString()
    val dbPassword = environment.config.property("storage.db.password").getString()
    DatabaseFactory.init(dbUrl, dbUser, dbPassword)
}
