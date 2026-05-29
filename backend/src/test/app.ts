import request from "supertest";
import { buildApp } from "../app.js";
import { testDb } from "./db.js";

/** Build the Express app wired to the shared Testcontainers database. */
export function buildTestApp(): ReturnType<typeof buildApp> {
  return buildApp({ db: testDb() });
}

/** Bootstrap the first admin via /api/auth/setup and return its bearer token. */
export async function setupAdminToken(
  app: ReturnType<typeof buildApp>,
  email = "admin@example.com",
  password = "pw",
): Promise<string> {
  const res = await request(app).post("/api/auth/setup").send({ email, password });
  return res.body.token as string;
}

/** Attach a bearer token to a supertest request. */
export function withAuth(req: request.Test, token: string): request.Test {
  return req.set("Authorization", `Bearer ${token}`);
}
