import type { Request } from "express";
import { currentUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { UserRepository, type UserRow } from "../storage/userRepository.js";

export interface FamilyContext {
  user: UserRow;
  familyId: string;
}

/**
 * Resolve the authenticated user and their family id (after requireAuth ran).
 * Throws 401 if the principal no longer maps to a user — matching the Kotlin
 * userAndFamily()/requireUserAndFamily() helpers.
 */
export async function requireUserAndFamily(
  users: UserRepository,
  req: Request,
): Promise<FamilyContext> {
  const { userId } = currentUser(req);
  const user = await users.findById(userId);
  if (!user) throw new HttpError(401, "Not authenticated");
  return { user, familyId: user.family_id };
}
