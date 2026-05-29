import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

describe("POST /api/auth/setup", () => {
  it("creates the first admin and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/setup")
      .send({ email: "Owner@Example.com", password: "s3cret" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({ email: "owner@example.com", role: "admin" });
    expect(res.body.user.familyId).toBeTypeOf("string");
  });

  it("rejects setup once a user exists", async () => {
    await request(app).post("/api/auth/setup").send({ email: "a@b.com", password: "pw" });
    const res = await request(app).post("/api/auth/setup").send({ email: "c@d.com", password: "pw" });
    expect(res.status).toBe(403);
  });

  it("400s on a blank email", async () => {
    const res = await request(app).post("/api/auth/setup").send({ email: "  ", password: "pw" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/);
  });
});

describe("POST /api/auth/login", () => {
  async function seedAdmin() {
    await request(app).post("/api/auth/setup").send({ email: "owner@example.com", password: "s3cret" });
  }

  it("returns a token for valid credentials", async () => {
    await seedAdmin();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "s3cret" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe("owner@example.com");
  });

  it("normalizes email casing/whitespace on login", async () => {
    await seedAdmin();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "  OWNER@example.com ", password: "s3cret" });
    expect(res.status).toBe(200);
  });

  it("401s on a wrong password", async () => {
    await seedAdmin();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "nope" });
    expect(res.status).toBe(401);
  });

  it("401s for an unknown user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "x" });
    expect(res.status).toBe(401);
  });
});
