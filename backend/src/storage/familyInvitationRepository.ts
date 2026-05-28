import type { Db } from "../db/kysely.js";

export const INVITE_STATUS_PENDING = "pending";
export const INVITE_STATUS_ACCEPTED = "accepted";

export interface FamilyInvitationRow {
  id: string;
  family_id: string;
  inviter_user_id: string;
  invitee_email: string;
  token: string;
  status: string;
  expires_at: Date;
}

const COLUMNS = [
  "id",
  "family_id",
  "inviter_user_id",
  "invitee_email",
  "token",
  "status",
  "expires_at",
] as const;

export class FamilyInvitationRepository {
  constructor(private readonly db: Db) {}

  async insert(
    familyId: string,
    inviterUserId: string,
    inviteeEmail: string,
    token: string,
    expiresAt: Date,
  ): Promise<string> {
    const row = await this.db
      .insertInto("family_invitations")
      .values({
        family_id: familyId,
        inviter_user_id: inviterUserId,
        invitee_email: inviteeEmail,
        token,
        status: INVITE_STATUS_PENDING,
        expires_at: expiresAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  findByToken(token: string): Promise<FamilyInvitationRow | undefined> {
    return this.db
      .selectFrom("family_invitations")
      .select(COLUMNS)
      .where("token", "=", token)
      .executeTakeFirst();
  }

  /** All pending invites for the family (regardless of expiry), newest first. */
  listPendingForFamily(familyId: string): Promise<FamilyInvitationRow[]> {
    return this.db
      .selectFrom("family_invitations")
      .select(COLUMNS)
      .where("family_id", "=", familyId)
      .where("status", "=", INVITE_STATUS_PENDING)
      .orderBy("created_at", "desc")
      .execute();
  }

  /** Count pending invites that have not yet expired. */
  async countPendingForFamily(familyId: string): Promise<number> {
    const row = await this.db
      .selectFrom("family_invitations")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("family_id", "=", familyId)
      .where("status", "=", INVITE_STATUS_PENDING)
      .where("expires_at", ">", new Date())
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async markAccepted(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable("family_invitations")
      .set({ status: INVITE_STATUS_ACCEPTED })
      .where("id", "=", id)
      .where("status", "=", INVITE_STATUS_PENDING)
      .executeTakeFirstOrThrow();
    return result.numUpdatedRows > 0n;
  }
}
