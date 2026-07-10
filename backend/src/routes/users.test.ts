import request from "supertest";
import { describe, expect, it } from "vitest";
import { ADMIN_IDENTITY, buildTestApp, withAuth } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

describe("GET /api/auth/me", () => {
  it("returns the current user profile, provisioning it on first sight", async () => {
    const res = await withAuth(request(app).get("/api/auth/me"), ADMIN_IDENTITY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "admin@example.com", role: "admin" });
    expect(res.body.id).toBeTypeOf("string");
    expect(res.body.familyId).toBeTypeOf("string");
  });

  it("is stable across requests for the same identity", async () => {
    const first = await withAuth(request(app).get("/api/auth/me"), ADMIN_IDENTITY);
    const second = await withAuth(request(app).get("/api/auth/me"), ADMIN_IDENTITY);
    expect(second.body).toEqual(first.body);
  });

  it("reflects the role asserted by the sidecar header, not the stored snapshot", async () => {
    await withAuth(request(app).get("/api/auth/me"), {
      id: "hs-x",
      email: "promoted@example.com",
      role: "user",
    });
    const promoted = await withAuth(request(app).get("/api/auth/me"), {
      id: "hs-x",
      email: "promoted@example.com",
      role: "admin",
    });
    expect(promoted.body.role).toBe("admin");
  });

  it("401s without identity headers", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
