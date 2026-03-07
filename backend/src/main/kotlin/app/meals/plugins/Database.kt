package app.meals.plugins

import app.meals.storage.DatabaseFactory
import io.ktor.server.application.*

fun Application.configureDatabase() {
    val dbUrl = System.getProperty("DB_URL") ?: System.getenv("DB_URL")
        ?: environment.config.propertyOrNull("storage.db.url")?.getString()
        ?: "jdbc:postgresql://localhost:5432/meals"
    val dbUser = System.getProperty("DB_USER") ?: System.getenv("DB_USER")
        ?: environment.config.propertyOrNull("storage.db.user")?.getString()
        ?: "meals"
    val dbPassword = System.getProperty("DB_PASSWORD") ?: System.getenv("DB_PASSWORD")
        ?: environment.config.propertyOrNull("storage.db.password")?.getString()
        ?: "meals"
    DatabaseFactory.init(dbUrl, dbUser, dbPassword)
}
