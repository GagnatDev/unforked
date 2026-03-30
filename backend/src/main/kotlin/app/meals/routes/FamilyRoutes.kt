package app.meals.routes

import app.meals.domain.AcceptFamilyInviteRequest
import app.meals.domain.CreateFamilyInviteRequest
import app.meals.domain.CreateFamilyInviteResponse
import app.meals.domain.FamilyMemberDto
import app.meals.domain.FamilyResponse
import app.meals.domain.PatchFamilyRequest
import app.meals.domain.PendingInviteDto
import app.meals.service.FamilyInviteService
import app.meals.storage.FamilyInvitationRepository
import app.meals.storage.FamilyRepository
import app.meals.storage.UserRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.familyRoutes() {
    route("/family") {
        get {
            val (_, familyId) = call.requireUserAndFamily() ?: return@get
            val family = FamilyRepository.findById(familyId)
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Family not found"))
            val members = UserRepository.listByFamily(familyId).map {
                FamilyMemberDto(it.id.toString(), it.email)
            }
            val pending = FamilyInvitationRepository.listPendingForFamily(familyId).map {
                PendingInviteDto(
                    id = it.id.toString(),
                    inviteeEmail = it.inviteeEmail,
                    token = it.token,
                    expiresAt = it.expiresAt.toString(),
                )
            }
            call.respond(
                FamilyResponse(
                    id = family.id.toString(),
                    defaultMealPlanPersons = family.defaultMealPlanPersons,
                    members = members,
                    pendingInvites = pending,
                )
            )
        }
        patch {
            val (_, familyId) = call.requireUserAndFamily() ?: return@patch
            val body = call.receive<PatchFamilyRequest>()
            if (body.defaultMealPlanPersons < 1 || body.defaultMealPlanPersons > 50) {
                return@patch call.respond(
                    HttpStatusCode.BadRequest,
                    mapOf("error" to "defaultMealPlanPersons must be between 1 and 50")
                )
            }
            if (!FamilyRepository.updateDefaultMealPlanPersons(familyId, body.defaultMealPlanPersons)) {
                return@patch call.respond(HttpStatusCode.NotFound, mapOf("error" to "Family not found"))
            }
            call.respond(mapOf("defaultMealPlanPersons" to body.defaultMealPlanPersons))
        }
        route("/invites") {
            post {
                val (user, familyId) = call.requireUserAndFamily() ?: return@post
                val body = call.receive<CreateFamilyInviteRequest>()
                val email = body.email.trim().lowercase().ifBlank { null }
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Email required"))
                try {
                    val (token, expiresAt) = FamilyInviteService.createPendingInvite(
                        familyId,
                        user.id,
                        email,
                    )
                    call.respond(CreateFamilyInviteResponse(token = token, expiresAt = expiresAt.toString()))
                } catch (e: Exception) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Cannot create invite")))
                }
            }
            post("/accept") {
                val (user, _) = call.requireUserAndFamily() ?: return@post
                val body = call.receive<AcceptFamilyInviteRequest>()
                val token = body.token.trim().ifBlank { null }
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Token required"))
                try {
                    FamilyInviteService.acceptInviteForExistingUser(user, token)
                    val updated = UserRepository.findById(user.id)!!
                    call.respond(mapOf("familyId" to updated.familyId.toString()))
                } catch (e: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Cannot accept")))
                }
            }
        }
    }
}
