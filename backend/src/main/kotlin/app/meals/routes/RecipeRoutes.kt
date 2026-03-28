package app.meals.routes

import app.meals.domain.RecipeDoc
import app.meals.domain.RecipeResponse
import app.meals.storage.RecipeRepository
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.util.UUID

fun Route.recipeRoutes() {
    route("/recipes") {
        get {
            val name = call.request.queryParameters["name"]
            val tag = call.request.queryParameters["tag"]
            val list = RecipeRepository.findAll(nameQuery = name, tagQuery = tag)
            call.respond(list.map { (id, doc) -> RecipeResponse(id.toString(), doc) })
        }
        get("/tags") {
            val q = call.request.queryParameters["q"] ?: ""
            val excludeId = call.request.queryParameters["excludeRecipeId"]?.let {
                runCatching { UUID.fromString(it) }.getOrNull()
            }
            if (q.isBlank()) {
                call.respond(emptyList<String>())
                return@get
            }
            val tags = RecipeRepository.suggestTags(q, excludeId)
            call.respond(tags)
        }
        get("/{id}") {
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@get call.respond(status = io.ktor.http.HttpStatusCode.BadRequest, "Invalid ID")
            val doc = RecipeRepository.findById(id)
                ?: return@get call.respond(status = io.ktor.http.HttpStatusCode.NotFound, "Recipe not found")
            call.respond(RecipeResponse(id.toString(), doc))
        }
        post {
            val body = call.receive<RecipeDoc>()
            val id = RecipeRepository.insert(body)
            call.respond(status = io.ktor.http.HttpStatusCode.Created, RecipeResponse(id.toString(), body))
        }
        put("/{id}") {
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@put call.respond(status = io.ktor.http.HttpStatusCode.BadRequest, "Invalid ID")
            val body = call.receive<RecipeDoc>()
            val updated = RecipeRepository.update(id, body)
            if (!updated) return@put call.respond(status = io.ktor.http.HttpStatusCode.NotFound, "Recipe not found")
            call.respond(RecipeResponse(id.toString(), body))
        }
        delete("/{id}") {
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@delete call.respond(status = io.ktor.http.HttpStatusCode.BadRequest, "Invalid ID")
            val deleted = RecipeRepository.delete(id)
            if (!deleted) return@delete call.respond(status = io.ktor.http.HttpStatusCode.NotFound, "Recipe not found")
            call.respond(status = io.ktor.http.HttpStatusCode.NoContent, Unit)
        }
    }
}
