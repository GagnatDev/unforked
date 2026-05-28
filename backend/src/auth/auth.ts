import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

export interface AuthUser {
  userId: string;
  role: string;
}

/**
 * Fixed identity used when DISABLE_AUTH=true and no bearer token is presented
 * (local dev + Playwright e2e). Ported verbatim from the Kotlin DevAuth object.
 */
export const DEV_AUTH = {
  USER_ID: "00000000-0000-4000-8000-000000000001",
  FAMILY_ID: "00000000-0000-4000-8000-0000000000f1",
  EMAIL: "dev@local.test",
} as const;

// Matches the Kotlin backend: bcrypt cost 12, 7-day HS256 tokens.
const BCRYPT_COST = 12;
const TOKEN_TTL = "7d";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/** Issue an HS256 token with sub=userId, the configured issuer/audience, and a role claim. */
export async function signToken(userId: string, role: string): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

/** Verify signature, issuer, audience, and expiry. Returns null on any failure. */
export async function verifyToken(raw: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(raw, secretKey(), {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["HS256"],
    });
    const userId = typeof payload.sub === "string" ? payload.sub : "";
    if (!userId) return null;
    const role = typeof payload.role === "string" ? payload.role : "user";
    return { userId, role };
  } catch {
    return null;
  }
}

/** Hash a plaintext password (bcrypt, cost 12). */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored bcrypt hash. bcryptjs reads the
 * `$2a`/`$2b` hashes produced by the Kotlin lib, so existing users keep working.
 */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
