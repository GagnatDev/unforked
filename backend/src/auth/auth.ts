/**
 * Identity model. Authentication itself is handled by the homectl-auth-proxy
 * sidecar in front of this app; the backend only reads the verified identity
 * headers it injects (see middleware/auth.ts).
 */
export interface AuthUser {
  userId: string;
  role: string;
}

/**
 * Fixed identity used when DISABLE_AUTH=true and no identity headers are present
 * (local dev + Playwright e2e). Ported verbatim from the Kotlin DevAuth object.
 */
export const DEV_AUTH = {
  USER_ID: "00000000-0000-4000-8000-000000000001",
  FAMILY_ID: "00000000-0000-4000-8000-0000000000f1",
  EMAIL: "dev@local.test",
} as const;

/** Collapse an app role (from X-Homectl-Role or storage) onto the two known roles. */
export function normalizeRole(role: string | undefined | null): string {
  return (role ?? "").toLowerCase() === "admin" ? "admin" : "user";
}
