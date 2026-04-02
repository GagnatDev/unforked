package app.meals.importer

import app.meals.domain.ImportRecipeResponse
import app.meals.domain.RecipeDoc
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import kotlinx.serialization.json.Json
import org.jsoup.Jsoup
import java.net.IDN
import java.net.InetAddress
import java.net.URI
import kotlin.math.min

object RecipeImporter {
    private const val MAX_HTML_BYTES: Int = 2_000_000

    private val client = HttpClient(CIO) {
        engine {
            requestTimeout = 15_000
        }
        expectSuccess = false
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    suspend fun importFromUrl(rawUrl: String): ImportRecipeResponse {
        val uri = parseAndValidatePublicUrl(rawUrl)

        val response = client.get(uri.toString()) {
            header(HttpHeaders.UserAgent, "meal-planning-app/recipe-import (+https://example.invalid)")
            header(HttpHeaders.Accept, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        }

        if (!response.status.isSuccess()) {
            return ImportRecipeResponse(
                doc = RecipeDoc(
                    name = "",
                    description = "",
                    sourceUrl = uri.toString(),
                    sourceName = uri.host,
                ),
                warnings = listOf("HTTP ${response.status.value} while fetching page.")
            )
        }

        val html = response.readBodyCapped(MAX_HTML_BYTES)
        val doc = Jsoup.parse(html, uri.toString())

        val warnings = mutableListOf<String>()

        val parsed = BestEffortParsers.parse(doc, json, warnings)
        val finalDoc = parsed.copy(
            sourceUrl = uri.toString(),
            sourceName = parsed.sourceName ?: doc.selectFirst("meta[property=og:site_name]")?.attr("content")?.trim()
                ?: uri.host,
        )

        if (finalDoc.name.isBlank()) warnings.add("Could not reliably detect a recipe title.")
        if (finalDoc.ingredients.isEmpty()) warnings.add("Could not reliably detect ingredients.")
        if (finalDoc.steps.isEmpty()) warnings.add("Could not reliably detect steps.")

        return ImportRecipeResponse(doc = finalDoc, warnings = warnings.distinct())
    }

    private fun parseAndValidatePublicUrl(raw: String): URI {
        val uri = runCatching { URI(raw.trim()) }.getOrNull()
            ?: throw IllegalArgumentException("Invalid URL")
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") throw IllegalArgumentException("Only http/https URLs are supported")
        val host = uri.host ?: throw IllegalArgumentException("URL must include a host")

        val asciiHost = runCatching { IDN.toASCII(host) }.getOrElse { host }
        val addresses = runCatching { InetAddress.getAllByName(asciiHost) }.getOrElse { emptyArray() }
        if (addresses.isEmpty()) throw IllegalArgumentException("Could not resolve host")
        if (addresses.any { it.isAnyLocalAddress || it.isLoopbackAddress || it.isLinkLocalAddress || it.isSiteLocalAddress }) {
            throw IllegalArgumentException("Refusing to fetch non-public addresses")
        }

        return uri
    }
}

private suspend fun HttpResponse.readBodyCapped(maxBytes: Int): String {
    val ch: ByteReadChannel = bodyAsChannel()
    val buf = ByteArray(8 * 1024)
    val out = ByteArrayOutputStreamCapped(maxBytes)
    while (!ch.isClosedForRead) {
        val n = ch.readAvailable(buf, 0, buf.size)
        if (n <= 0) break
        out.write(buf, 0, n)
    }
    return out.toByteArray().toString(Charsets.UTF_8)
}

private class ByteArrayOutputStreamCapped(private val maxBytes: Int) {
    private var bytes = ByteArray(min(32 * 1024, maxBytes))
    private var size = 0

    fun write(b: ByteArray, off: Int, len: Int) {
        if (len <= 0) return
        if (size + len > maxBytes) throw IllegalArgumentException("Response too large")
        val required = size + len
        if (required > bytes.size) {
            var next = bytes.size
            while (next < required) next = min(next * 2, maxBytes)
            bytes = bytes.copyOf(next)
        }
        b.copyInto(bytes, destinationOffset = size, startIndex = off, endIndex = off + len)
        size += len
    }

    fun toByteArray(): ByteArray = bytes.copyOf(size)
}

