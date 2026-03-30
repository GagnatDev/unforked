package app.meals.domain

import kotlinx.serialization.Serializable

@Serializable
data class FamilyMemberDto(val id: String, val email: String)

@Serializable
data class PendingInviteDto(
    val id: String,
    val inviteeEmail: String,
    val token: String,
    val expiresAt: String,
)

@Serializable
data class FamilyResponse(
    val id: String,
    val defaultMealPlanPersons: Int,
    val members: List<FamilyMemberDto>,
    val pendingInvites: List<PendingInviteDto>,
)

@Serializable
data class PatchFamilyRequest(val defaultMealPlanPersons: Int)

@Serializable
data class CreateFamilyInviteRequest(val email: String)

@Serializable
data class CreateFamilyInviteResponse(val token: String, val expiresAt: String)

@Serializable
data class AcceptFamilyInviteRequest(val token: String)

@Serializable
data class RegisterWithInviteRequest(val token: String, val email: String, val password: String)
