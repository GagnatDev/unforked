import { createHash, randomBytes } from "node:crypto";

/**
 * Machine-API key format: a recognisable prefix (identifiable in logs and by
 * secret scanners) followed by 32 bytes of CSPRNG entropy. Only the SHA-256
 * hash is persisted — the key is high-entropy, so a fast unsalted hash is
 * sufficient (no bcrypt needed) and lookup stays a point query by equality.
 */
export const API_KEY_PREFIX = "ufk_";

/**
 * The scopes a key can carry. Every key can read; `write` additionally allows
 * the mutating machine endpoints (docs/aivo-integration.md §8 Phase 3 — today:
 * adding shopping-list items). Keys default to read-only at creation.
 */
export const API_KEY_SCOPES = ["read", "write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Generate a fresh plaintext API key. Shown to the user exactly once. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

/** The stored/lookup form of a key. Never log or return the plaintext. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
