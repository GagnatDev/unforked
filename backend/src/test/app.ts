import request from "supertest";
import { buildApp } from "../app.js";
import { testDb } from "./db.js";

/** Build the Express app wired to the shared Testcontainers database. */
export function buildTestApp(): ReturnType<typeof buildApp> {
  return buildApp({ db: testDb() });
}

/** An identity as the auth-proxy sidecar would assert it via headers. */
export interface TestIdentity {
  id: string;
  email: string;
  role?: string;
}

export const ADMIN_IDENTITY: TestIdentity = {
  id: "hs-admin",
  email: "admin@example.com",
  role: "admin",
};

/** Attach the sidecar identity headers to a supertest request. */
export function withAuth(req: request.Test, identity: TestIdentity): request.Test {
  const withIdentity = req
    .set("X-Homectl-User", identity.id)
    .set("X-Homectl-Email", identity.email);
  return identity.role ? withIdentity.set("X-Homectl-Role", identity.role) : withIdentity;
}

/**
 * Provision the default admin (the first authenticated request JIT-creates the
 * local user and its family) and return the identity to pass to withAuth.
 */
export async function setupAdmin(
  app: ReturnType<typeof buildApp>,
  identity: TestIdentity = ADMIN_IDENTITY,
): Promise<TestIdentity> {
  await withAuth(request(app).get("/api/auth/me"), identity).expect(200);
  return identity;
}
