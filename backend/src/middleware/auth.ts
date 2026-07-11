import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config/env.js";
import { DEV_AUTH, normalizeRole, type AuthUser } from "../auth/auth.js";
import type { Db } from "../db/kysely.js";
import { UserRepository, type UserRow } from "../storage/userRepository.js";
import { HttpError } from "./error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Identity headers injected by the homectl-auth-proxy sidecar. The sidecar
 * strips any client-supplied copies before injecting its own, and the app
 * container is only reachable through the sidecar (Service targets the proxy
 * port), so these can be trusted as-is.
 */
export const IDENTITY_HEADERS = {
  user: "x-homectl-user",
  email: "x-homectl-email",
  role: "x-homectl-role",
} as const;

/** Unique-violation code from Postgres (concurrent first-login provisioning). */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Map a homectl-auth identity onto a local user row, provisioning one (with its
 * own new family) on first sighting. Users are keyed on email — the same
 * identity key homectl-auth uses — so accounts imported into homectl-auth
 * resolve back to their original local rows.
 */
export async function resolveLocalUser(db: Db, email: string, role: string): Promise<UserRow> {
  const users = new UserRepository(db);
  const normalized = email.trim().toLowerCase();
  const existing = await users.findByEmail(normalized);
  if (existing) return existing;
  try {
    return await users.createWithNewFamily(normalized, null, role);
  } catch (err) {
    // Two concurrent first requests can race the insert; the loser re-reads.
    if (isUniqueViolation(err)) {
      const raced = await users.findByEmail(normalized);
      if (raced) return raced;
    }
    throw err;
  }
}

export interface RequireAuthOptions {
  /** Overrides env.DISABLE_AUTH (used in tests). */
  disableAuth?: boolean;
}

/**
 * Authenticate the request from the sidecar's X-Homectl-* headers, populating
 * req.user with the local user id and the app role asserted by homectl-auth.
 *
 * When auth is disabled (dev/e2e) and no identity headers are present, the
 * fixed dev admin identity is used instead — the sidecar-less local setup from
 * the integration guide ("default to a fixed local user when the X-Homectl-*
 * headers are absent").
 */
export function requireAuth(db: Db, options: RequireAuthOptions = {}): RequestHandler {
  const disableAuth = options.disableAuth ?? env.DISABLE_AUTH;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subject = req.get(IDENTITY_HEADERS.user);
    const email = req.get(IDENTITY_HEADERS.email);

    if (!subject || !email) {
      if (disableAuth) {
        req.user = { userId: DEV_AUTH.USER_ID, role: "admin" };
        next();
        return;
      }
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }

    try {
      const role = normalizeRole(req.get(IDENTITY_HEADERS.role));
      const user = await resolveLocalUser(db, email, role);
      req.user = { userId: user.id, role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Require the authenticated user to have the admin role. Use after requireAuth. */
export function requireAdmin(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admin role required" });
      return;
    }
    next();
  };
}

/** Read the authenticated user, asserting requireAuth ran first. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}
