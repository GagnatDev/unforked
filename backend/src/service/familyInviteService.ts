import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth/auth.js";
import type { Db } from "../db/kysely.js";
import { HttpError } from "../middleware/error.js";
import {
  FamilyInvitationRepository,
  INVITE_STATUS_PENDING,
  type FamilyInvitationRow,
} from "../storage/familyInvitationRepository.js";
import { FamilyRepository } from "../storage/familyRepository.js";
import { UserRepository, type UserRow } from "../storage/userRepository.js";

const MAX_MEMBERS = 5;
const INVITE_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class FamilyInviteService {
  static readonly MAX_MEMBERS = MAX_MEMBERS;

  constructor(private readonly db: Db) {}

  generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  /** Create a pending invite. Conflicts (full / already a member) throw 409. */
  async createPendingInvite(
    familyId: string,
    inviterUserId: string,
    inviteeEmail: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const normalized = inviteeEmail.trim().toLowerCase();
    const users = new UserRepository(this.db);
    const invites = new FamilyInvitationRepository(this.db);

    const members = await users.countInFamily(familyId);
    const pending = await invites.countPendingForFamily(familyId);
    if (members + pending >= MAX_MEMBERS) {
      throw new HttpError(409, "Family is full or has too many pending invitations");
    }
    const existing = (await users.listByFamily(familyId)).some((u) => u.email === normalized);
    if (existing) {
      throw new HttpError(409, "User is already a member of this family");
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS);
    await invites.insert(familyId, inviterUserId, normalized, token, expiresAt);
    return { token, expiresAt };
  }

  /**
   * Accept an invite as an already-registered user: move recipes to the new
   * family, drop the old meal plans, switch the user, and delete the old family
   * if it is now empty. Only allowed when the user is the sole member of their
   * current family (to avoid orphaning shared data).
   */
  async acceptInviteForExistingUser(user: UserRow, token: string): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const users = new UserRepository(trx);
      const invites = new FamilyInvitationRepository(trx);
      const families = new FamilyRepository(trx);

      const email = user.email.trim().toLowerCase();
      const inv = await validatePendingInvite(
        invites,
        token,
        email,
        "This invitation was sent to a different email address",
      );
      if (user.family_id === inv.family_id) {
        throw new HttpError(400, "You already belong to this family");
      }
      if ((await users.countInFamily(user.family_id)) !== 1) {
        throw new HttpError(
          400,
          "You can only join with this flow when you are the only member of your current family",
        );
      }
      if ((await users.countInFamily(inv.family_id)) >= MAX_MEMBERS) {
        throw new HttpError(400, "This family is already full");
      }

      await trx
        .updateTable("recipes")
        .set({ family_id: inv.family_id })
        .where("family_id", "=", user.family_id)
        .execute();
      await trx.deleteFrom("meal_plans").where("family_id", "=", user.family_id).execute();
      await users.updateFamilyId(user.id, inv.family_id);
      await invites.markAccepted(inv.id);
      await families.deleteIfEmpty(user.family_id);
      return inv.family_id;
    });
  }

  /** Register a brand-new user into the inviting family. Returns the new user id. */
  async registerWithInvite(token: string, email: string, password: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    return this.db.transaction().execute(async (trx) => {
      const users = new UserRepository(trx);
      const invites = new FamilyInvitationRepository(trx);

      const inv = await validatePendingInvite(
        invites,
        token,
        normalized,
        "Email does not match this invitation",
      );
      if (await users.findByEmail(normalized)) {
        throw new HttpError(400, "An account with this email already exists");
      }
      if ((await users.countInFamily(inv.family_id)) >= MAX_MEMBERS) {
        throw new HttpError(400, "This family is already full");
      }
      const hash = await hashPassword(password);
      const newUserId = await users.insertUser(normalized, hash, "user", inv.family_id);
      await invites.markAccepted(inv.id);
      return newUserId;
    });
  }
}

/** Shared invite checks for the accept + register flows. All failures throw 400. */
async function validatePendingInvite(
  invites: FamilyInvitationRepository,
  token: string,
  normalizedEmail: string,
  emailMismatchMessage: string,
): Promise<FamilyInvitationRow> {
  const inv = await invites.findByToken(token);
  if (!inv) throw new HttpError(400, "Invalid or unknown invitation");
  if (inv.status !== INVITE_STATUS_PENDING) throw new HttpError(400, "Invitation is no longer valid");
  if (inv.expires_at < new Date()) throw new HttpError(400, "Invitation has expired");
  if (inv.invitee_email !== normalizedEmail) throw new HttpError(400, emailMismatchMessage);
  return inv;
}
