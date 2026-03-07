package app.meals.storage

import org.flywaydb.core.Flyway
import java.sql.Connection
import java.util.concurrent.ConcurrentLinkedQueue
import javax.sql.DataSource

object DatabaseFactory {
    private var dataSource: DataSource? = null
    private val pool = ConcurrentLinkedQueue<Connection>()

    fun init(url: String, user: String, password: String) {
        val ds = org.postgresql.ds.PGSimpleDataSource().apply {
            setURL(url)
            this.user = user
            this.password = password
        }
        dataSource = ds
        val flyway = Flyway.configure()
            .dataSource(url, user, password)
            .locations("classpath:db/migration")
            .validateMigrationNaming(true)
            .load()
        flyway.migrate()
        ensureSchema(ds)
    }

    private fun ensureSchema(ds: DataSource) {
        val conn = ds.connection
        try {
            val rs = conn.createStatement().executeQuery(
                """SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipes'"""
            )
            if (!rs.next()) {
                val stream = javaClass.getResourceAsStream("/db/migration/V1__create_initial_schema.sql")
                    ?: return
                val sql = stream.reader().readText()
                stream.close()
                val statements = sql.split(";").map { it.trim() }.filter { it.isNotBlank() && !it.startsWith("--") }
                val stmt = conn.createStatement()
                try {
                    for (statement in statements) {
                        if (statement.isNotBlank()) stmt.execute(statement)
                    }
                } finally {
                    stmt.close()
                }
            }
        } finally {
            conn.close()
        }
    }

    fun getConnection(): Connection {
        val ds = dataSource ?: error("Database not initialized")
        return ds.connection
    }

    fun <T> query(block: (Connection) -> T): T {
        val conn = getConnection()
        try {
            return block(conn)
        } finally {
            conn.close()
        }
    }
}
