import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { API_KEY_PREFIX } from "../auth/apiKeys.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

let token: TestIdentity;
beforeEach(async () => {
  token = await setupAdmin(app);
});

async function createKey(identity: TestIdentity, name = "Aivo") {
  const res = await withAuth(request(app).post("/api/api-keys"), identity).send({ name });
  expect(res.status).toBe(201);
  return res.body as { id: string; name: string; key: string; scopes: string[] };
}

describe("POST /api/api-keys", () => {
  it("creates a key and returns the plaintext exactly once", async () => {
    const created = await createKey(token);
    expect(created.key).toMatch(new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{43}$`));
    expect(created.name).toBe("Aivo");
    expect(created.scopes).toEqual(["read"]);

    // The list never exposes the plaintext (or any hash) again.
    const list = await withAuth(request(app).get("/api/api-keys"), token);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.id);
    expect(JSON.stringify(list.body)).not.toContain(created.key);
    expect(Object.keys(list.body[0])).not.toContain("key");
    expect(Object.keys(list.body[0])).not.toContain("key_hash");
  });

  it("generates a distinct secret per key", async () => {
    const a = await createKey(token, "one");
    const b = await createKey(token, "two");
    expect(a.key).not.toBe(b.key);
  });

  it("rejects a blank name", async () => {
    const res = await withAuth(request(app).post("/api/api-keys"), token).send({ name: "  " });
    expect(res.status).toBe(400);
  });

  it("creates a write-capable key when asked, always keeping read", async () => {
    const res = await withAuth(request(app).post("/api/api-keys"), token).send({
      name: "Aivo rw",
      scopes: ["write"],
    });
    expect(res.status).toBe(201);
    expect(res.body.scopes).toEqual(["read", "write"]);
  });

  it("rejects unknown scopes", async () => {
    const res = await withAuth(request(app).post("/api/api-keys"), token).send({
      name: "Aivo",
      scopes: ["admin"],
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/api-keys", () => {
  it("lists only the caller's keys", async () => {
    await createKey(token, "mine");
    const other = await setupAdmin(app, { id: "hs-other", email: "other@example.com" });
    await createKey(other, "theirs");

    const res = await withAuth(request(app).get("/api/api-keys"), token);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("mine");
  });
});

describe("DELETE /api/api-keys/:id", () => {
  it("revokes a key (kept, flagged revoked)", async () => {
    const created = await createKey(token);
    const del = await withAuth(request(app).delete(`/api/api-keys/${created.id}`), token);
    expect(del.status).toBe(204);

    const list = await withAuth(request(app).get("/api/api-keys"), token);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].revokedAt).not.toBeNull();
  });

  it("404s on another user's key", async () => {
    const created = await createKey(token);
    const other = await setupAdmin(app, { id: "hs-other", email: "other@example.com" });
    const res = await withAuth(request(app).delete(`/api/api-keys/${created.id}`), other);
    expect(res.status).toBe(404);
  });

  it("400s on a malformed id", async () => {
    const res = await withAuth(request(app).delete("/api/api-keys/not-a-uuid"), token);
    expect(res.status).toBe(400);
  });
});
