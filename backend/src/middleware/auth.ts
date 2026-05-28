import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config/env.js";
import { DEV_AUTH, verifyToken, type AuthUser } from "../auth/auth.js";
import { HttpError } from "./error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 ? token : null;
}

export interface RequireAuthOptions {
  /** Overrides env.DISABLE_AUTH (used in tests). */
  disableAuth?: boolean;
}

/**
 * Authenticate the request from the bearer token, populating req.user.
 *
 * When auth is disabled (dev/e2e): a present-but-invalid token is still rejected
 * (401), but a missing token falls back to the fixed dev admin identity. This
 * mirrors the Kotlin DISABLE_AUTH provider exactly.
 */
export function requireAuth(options: RequireAuthOptions = {}): RequestHandler {
  const disableAuth = options.disableAuth ?? env.DISABLE_AUTH;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearer(req);

    if (disableAuth) {
      if (token) {
        const decoded = await verifyToken(token);
        if (!decoded) {
          res.status(401).json({ error: "Invalid or expired token" });
          return;
        }
        req.user = decoded;
      } else {
        req.user = { userId: DEV_AUTH.USER_ID, role: "admin" };
      }
      next();
      return;
    }

    if (!token) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }
    req.user = decoded;
    next();
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
