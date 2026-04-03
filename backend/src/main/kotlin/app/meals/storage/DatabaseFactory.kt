package app.meals.storage

import org.flywaydb.core.Flyway
import java.sql.Connection

object DatabaseFactory {
    private var dataSource: javax.sql.DataSource? = null

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

    fun <T> transaction(block: (Connection) -> T): T {
        val conn = getConnection()
        try {
            conn.autoCommit = false
            val result = block(conn)
            conn.commit()
            return result
        } catch (e: Exception) {
            conn.rollback()
            throw e
        } finally {
            conn.autoCommit = true
            conn.close()
        }
    }
}
