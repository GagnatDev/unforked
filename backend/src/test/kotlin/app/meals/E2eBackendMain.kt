package app.meals

import com.typesafe.config.ConfigFactory
import com.typesafe.config.ConfigValueFactory
import io.ktor.server.application.Application
import io.ktor.server.engine.applicationEngineEnvironment
import io.ktor.server.engine.connector
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main() {
    TestDatabase.startIfNeeded()
    TestDatabase.resetSchema()

    val port = System.getenv("E2E_BACKEND_PORT")?.toIntOrNull() ?: 8080
    val host = System.getenv("E2E_BACKEND_HOST") ?: "127.0.0.1"

    val jdbcUrl = System.getProperty("DB_URL") ?: error("DB_URL is not set")
    val dbUser = System.getProperty("DB_USER") ?: error("DB_USER is not set")
    val dbPassword = System.getProperty("DB_PASSWORD") ?: error("DB_PASSWORD is not set")

    val baseConfig = ConfigFactory.load()
    val config = baseConfig
        .withValue("ktor.application.modules", ConfigValueFactory.fromIterable(emptyList<Any>()))
        .withValue("storage.db.url", ConfigValueFactory.fromAnyRef(jdbcUrl))
        .withValue("storage.db.user", ConfigValueFactory.fromAnyRef(dbUser))
        .withValue("storage.db.password", ConfigValueFactory.fromAnyRef(dbPassword))
        // Typesafe Config + Ktor read this via getString(); a bare boolean override can be misread.
        .withValue("auth.disabled", ConfigValueFactory.fromAnyRef("true"))
        .withValue("seed.testData", ConfigValueFactory.fromAnyRef(false))

    val server = embeddedServer(
        factory = Netty,
        environment = applicationEngineEnvironment {
            this.config = io.ktor.server.config.HoconApplicationConfig(config)
            module(Application::module)
            connector {
                this.host = host
                this.port = port
            }
        }
    )

    Runtime.getRuntime().addShutdownHook(
        Thread {
            server.stop(1000, 5000)
            TestDatabase.stopIfStarted()
        }
    )

    server.start(wait = true)
}
