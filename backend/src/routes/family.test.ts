import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

function bearer(req: request.Test, token: string): request.Test {
  return req.set("Authorization", `Bearer ${token}`);
}

async function setupAdmin(): Promise<string> {
  const res = await request(app)
    .post("/api/auth/setup")
    .send({ email: "admin@example.com", password: "pw" });
  return res.body.token as string;
}

async function createUser(adminToken: string, email: string): Promise<void> {
  await bearer(request(app).post("/api/users"), adminToken).send({ email, password: "pw" });
}

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "pw" });
  return res.body.token as string;
}

async function createInvite(adminToken: string, email: string): Promise<string> {
  const res = await bearer(request(app).post("/api/family/invites"), adminToken).send({ email });
  return res.body.token as string;
}

let adminToken: string;
beforeEach(async () => {
  adminToken = await setupAdmin();
});

describe("GET /api/family", () => {
  it("returns the family with its sole member and no invites", async () => {
    const res = await bearer(request(app).get("/api/family"), adminToken);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe("admin@example.com");
    expect(res.body.pendingInvites).toHaveLength(0);
    expect(res.body.defaultMealPlanPersons).toBe(4);
  });
});

describe("PATCH /api/family", () => {
  it("updates the default meal plan persons", async () => {
    const res = await bearer(request(app).patch("/api/family"), adminToken).send({
      defaultMealPlanPersons: 6,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ defaultMealPlanPersons: 6 });

    const get = await bearer(request(app).get("/api/family"), adminToken);
    expect(get.body.defaultMealPlanPersons).toBe(6);
  });

  it("400s on an out-of-range value", async () => {
    const res = await bearer(request(app).patch("/api/family"), adminToken).send({
      defaultMealPlanPersons: 51,
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/family/invites", () => {
  it("creates a pending invite and surfaces it on the family", async () => {
    const token = await createInvite(adminToken, "guest@example.com");
    expect(token).toBeTypeOf("string");

    const family = await bearer(request(app).get("/api/family"), adminToken);
    expect(family.body.pendingInvites).toHaveLength(1);
    expect(family.body.pendingInvites[0].inviteeEmail).toBe("guest@example.com");
  });

  it("409s when inviting an existing member", async () => {
    const res = await bearer(request(app).post("/api/family/invites"), adminToken).send({
      email: "admin@example.com",
    });
    expect(res.status).toBe(409);
  });

  it("409s once the family is full (members + pending >= 5)", async () => {
    for (const name of ["a", "b", "c", "d"]) {
      await createInvite(adminToken, `${name}@example.com`);
    }
    const res = await bearer(request(app).post("/api/family/invites"), adminToken).send({
      email: "e@example.com",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/register-invite", () => {
  it("registers a new user into the inviting family", async () => {
    const inviteToken = await createInvite(adminToken, "newbie@example.com");
    const res = await request(app)
      .post("/api/auth/register-invite")
      .send({ token: inviteToken, email: "newbie@example.com", password: "pw" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("newbie@example.com");

    const family = await bearer(request(app).get("/api/family"), adminToken);
    expect(family.body.members).toHaveLength(2);
    expect(family.body.pendingInvites).toHaveLength(0);
  });

  it("400s when the email does not match the invite", async () => {
    const inviteToken = await createInvite(adminToken, "invited@example.com");
    const res = await request(app)
      .post("/api/auth/register-invite")
      .send({ token: inviteToken, email: "other@example.com", password: "pw" });
    expect(res.status).toBe(400);
  });

  it("400s on an unknown token", async () => {
    const res = await request(app)
      .post("/api/auth/register-invite")
      .send({ token: "deadbeef", email: "x@example.com", password: "pw" });
    expect(res.status).toBe(400);
  });

  it("400s when an account with the email already exists", async () => {
    await createUser(adminToken, "taken@example.com");
    const inviteToken = await createInvite(adminToken, "taken@example.com");
    const res = await request(app)
      .post("/api/auth/register-invite")
      .send({ token: inviteToken, email: "taken@example.com", password: "pw" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/family/invites/accept", () => {
  it("moves a sole-member user into the inviting family", async () => {
    await createUser(adminToken, "solo@example.com");
    const inviteToken = await createInvite(adminToken, "solo@example.com");
    const soloToken = await login("solo@example.com");

    const res = await bearer(request(app).post("/api/family/invites/accept"), soloToken).send({
      token: inviteToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.familyId).toBeTypeOf("string");

    const family = await bearer(request(app).get("/api/family"), adminToken);
    expect(family.body.members.map((m: { email: string }) => m.email).sort()).toEqual([
      "admin@example.com",
      "solo@example.com",
    ]);
  });

  it("400s on an invalid token", async () => {
    await createUser(adminToken, "solo@example.com");
    const soloToken = await login("solo@example.com");
    const res = await bearer(request(app).post("/api/family/invites/accept"), soloToken).send({
      token: "nope",
    });
    expect(res.status).toBe(400);
  });
});
