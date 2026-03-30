package app.meals.routes

import app.meals.domain.RecipeDoc
import app.meals.domain.RecipeResponse
import app.meals.storage.RecipeRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import java.util.UUID

fun Route.recipeRoutes() {
    route("/recipes") {
        get {
            val familyId = call.requireFamilyId() ?: return@get
            val name = call.request.queryParameters["name"]
            val tag = call.request.queryParameters["tag"]
            val list = RecipeRepository.findAll(familyId, nameQuery = name, tagQuery = tag)
            call.respond(list.map { (id, doc) -> RecipeResponse(id.toString(), doc) })
        }
        get("/tags") {
            val familyId = call.requireFamilyId() ?: return@get
            val q = call.request.queryParameters["q"] ?: ""
            val excludeId = call.request.queryParameters["excludeRecipeId"]?.let {
                runCatching { UUID.fromString(it) }.getOrNull()
            }
            if (q.isBlank()) {
                call.respond(emptyList<String>())
                return@get
            }
            val tags = RecipeRepository.suggestTags(familyId, q, excludeId)
            call.respond(tags)
        }
        get("/{id}") {
            val familyId = call.requireFamilyId() ?: return@get
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@get call.respond(status = HttpStatusCode.BadRequest, "Invalid ID")
            val doc = RecipeRepository.findById(familyId, id)
                ?: return@get call.respond(status = HttpStatusCode.NotFound, "Recipe not found")
            call.respond(RecipeResponse(id.toString(), doc))
        }
        post {
            val familyId = call.requireFamilyId() ?: return@post
            val body = call.receive<RecipeDoc>()
            val id = RecipeRepository.insert(familyId, body)
            call.respond(status = HttpStatusCode.Created, RecipeResponse(id.toString(), body))
        }
        put("/{id}") {
            val familyId = call.requireFamilyId() ?: return@put
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@put call.respond(status = HttpStatusCode.BadRequest, "Invalid ID")
            val body = call.receive<RecipeDoc>()
            val updated = RecipeRepository.update(familyId, id, body)
            if (!updated) return@put call.respond(status = HttpStatusCode.NotFound, "Recipe not found")
            call.respond(RecipeResponse(id.toString(), body))
        }
        delete("/{id}") {
            val familyId = call.requireFamilyId() ?: return@delete
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@delete call.respond(status = HttpStatusCode.BadRequest, "Invalid ID")
            val deleted = RecipeRepository.delete(familyId, id)
            if (!deleted) return@delete call.respond(status = HttpStatusCode.NotFound, "Recipe not found")
            call.respond(status = HttpStatusCode.NoContent, Unit)
        }
    }
}
