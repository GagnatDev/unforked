import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

/** Bootstrap the first admin and return its bearer token. */
async function setupAdmin(): Promise<string> {
  const res = await request(app)
    .post("/api/auth/setup")
    .send({ email: "admin@example.com", password: "s3cret" });
  return res.body.token as string;
}

function auth(req: request.Test, token: string): request.Test {
  return req.set("Authorization", `Bearer ${token}`);
}

describe("GET /api/auth/me", () => {
  it("returns the current user profile", async () => {
    const token = await setupAdmin();
    const res = await auth(request(app).get("/api/auth/me"), token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "admin@example.com", role: "admin" });
  });

  it("401s without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/users", () => {
  it("lets an admin create a user (201)", async () => {
    const token = await setupAdmin();
    const res = await auth(request(app).post("/api/users"), token).send({
      email: "member@example.com",
      password: "pw",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "member@example.com", role: "user" });
  });

  it("defaults an unknown role to user", async () => {
    const token = await setupAdmin();
    const res = await auth(request(app).post("/api/users"), token).send({
      email: "weird@example.com",
      password: "pw",
      role: "superuser",
    });
    expect(res.body.role).toBe("user");
  });

  it("honors an explicit admin role", async () => {
    const token = await setupAdmin();
    const res = await auth(request(app).post("/api/users"), token).send({
      email: "admin2@example.com",
      password: "pw",
      role: "admin",
    });
    expect(res.body.role).toBe("admin");
  });

  it("409s on a duplicate email", async () => {
    const token = await setupAdmin();
    await auth(request(app).post("/api/users"), token).send({ email: "dup@example.com", password: "pw" });
    const res = await auth(request(app).post("/api/users"), token).send({
      email: "dup@example.com",
      password: "pw",
    });
    expect(res.status).toBe(409);
  });

  it("403s for a non-admin user", async () => {
    const token = await setupAdmin();
    await auth(request(app).post("/api/users"), token).send({ email: "plain@example.com", password: "pw" });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "plain@example.com", password: "pw" });
    const res = await auth(request(app).post("/api/users"), login.body.token).send({
      email: "another@example.com",
      password: "pw",
    });
    expect(res.status).toBe(403);
  });

  it("401s without a token", async () => {
    const res = await request(app).post("/api/users").send({ email: "x@y.com", password: "pw" });
    expect(res.status).toBe(401);
  });
});
