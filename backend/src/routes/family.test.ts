import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

function member(email: string): TestIdentity {
  return { id: `hs-${email}`, email, role: "user" };
}

async function createInvite(inviter: TestIdentity, email: string): Promise<string> {
  const res = await withAuth(request(app).post("/api/family/invites"), inviter).send({ email });
  return res.body.token as string;
}

let admin: TestIdentity;
beforeEach(async () => {
  admin = await setupAdmin(app);
});

describe("GET /api/family", () => {
  it("returns the family with its sole member and no invites", async () => {
    const res = await withAuth(request(app).get("/api/family"), admin);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe("admin@example.com");
    expect(res.body.pendingInvites).toHaveLength(0);
    expect(res.body.defaultMealPlanPersons).toBe(4);
  });
});

describe("PATCH /api/family", () => {
  it("updates the default meal plan persons", async () => {
    const res = await withAuth(request(app).patch("/api/family"), admin).send({
      defaultMealPlanPersons: 6,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ defaultMealPlanPersons: 6 });

    const get = await withAuth(request(app).get("/api/family"), admin);
    expect(get.body.defaultMealPlanPersons).toBe(6);
  });

  it("400s on an out-of-range value", async () => {
    const res = await withAuth(request(app).patch("/api/family"), admin).send({
      defaultMealPlanPersons: 51,
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/family/invites", () => {
  it("creates a pending invite and surfaces it on the family", async () => {
    const token = await createInvite(admin, "guest@example.com");
    expect(token).toBeTypeOf("string");

    const family = await withAuth(request(app).get("/api/family"), admin);
    expect(family.body.pendingInvites).toHaveLength(1);
    expect(family.body.pendingInvites[0].inviteeEmail).toBe("guest@example.com");
  });

  it("409s when inviting an existing member", async () => {
    const res = await withAuth(request(app).post("/api/family/invites"), admin).send({
      email: "admin@example.com",
    });
    expect(res.status).toBe(409);
  });

  it("409s once the family is full (members + pending >= 5)", async () => {
    for (const name of ["a", "b", "c", "d"]) {
      await createInvite(admin, `${name}@example.com`);
    }
    const res = await withAuth(request(app).post("/api/family/invites"), admin).send({
      email: "e@example.com",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/family/invites/accept", () => {
  it("moves a freshly provisioned sole-member user into the inviting family", async () => {
    // The invitee logs in through the auth sidecar and is JIT-provisioned into
    // its own solo family, then accepts the invite.
    const solo = member("solo@example.com");
    await setupAdmin(app, solo);
    const inviteToken = await createInvite(admin, "solo@example.com");

    const res = await withAuth(request(app).post("/api/family/invites/accept"), solo).send({
      token: inviteToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.familyId).toBeTypeOf("string");

    const family = await withAuth(request(app).get("/api/family"), admin);
    expect(family.body.members.map((m: { email: string }) => m.email).sort()).toEqual([
      "admin@example.com",
      "solo@example.com",
    ]);
  });

  it("400s when the invite was addressed to a different email", async () => {
    const other = member("other@example.com");
    await setupAdmin(app, other);
    const inviteToken = await createInvite(admin, "someoneelse@example.com");
    const res = await withAuth(request(app).post("/api/family/invites/accept"), other).send({
      token: inviteToken,
    });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid token", async () => {
    const solo = member("solo@example.com");
    await setupAdmin(app, solo);
    const res = await withAuth(request(app).post("/api/family/invites/accept"), solo).send({
      token: "nope",
    });
    expect(res.status).toBe(400);
  });
});

describe("removed legacy auth endpoints", () => {
  it("no longer exposes password login or invite registration", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "pw" });
    expect(login.status).toBe(401); // falls through to requireAuth on /api

    const register = await request(app)
      .post("/api/auth/register-invite")
      .send({ token: "t", email: "x@example.com", password: "pw" });
    expect(register.status).toBe(401);
  });
});
