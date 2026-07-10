import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { DEV_AUTH } from "../auth/auth.js";
import { UserRepository } from "../storage/userRepository.js";
import { testDb, useCleanDb } from "../test/db.js";
import { currentUser, requireAdmin, requireAuth, type RequireAuthOptions } from "./auth.js";
import { HttpError } from "./error.js";

useCleanDb();

function appWith(opts: RequireAuthOptions, admin = false): Express {
  const app = express();
  const auth = requireAuth(testDb(), opts);
  const chain = admin ? [auth, requireAdmin()] : [auth];
  app.get("/who", ...chain, (req, res) => {
    res.json(req.user);
  });
  return app;
}

function identity(req: request.Test, email: string, role?: string): request.Test {
  const r = req.set("X-Homectl-User", "hs-sub-1").set("X-Homectl-Email", email);
  return role ? r.set("X-Homectl-Role", role) : r;
}

describe("requireAuth (auth enabled)", () => {
  const app = appWith({ disableAuth: false });

  it("401s without identity headers", async () => {
    const res = await request(app).get("/who");
    expect(res.status).toBe(401);
  });

  it("401s when only the user header is present (no email to map)", async () => {
    const res = await request(app).get("/who").set("X-Homectl-User", "sub-1");
    expect(res.status).toBe(401);
  });

  it("provisions a local user on first sighting and exposes req.user", async () => {
    const res = await identity(request(app).get("/who"), "new@example.com", "admin");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");

    const created = await new UserRepository(testDb()).findByEmail("new@example.com");
    expect(created).toBeDefined();
    expect(created?.password_hash).toBeNull();
    expect(res.body.userId).toBe(created?.id);
  });

  it("resolves the same local user on subsequent requests", async () => {
    const first = await identity(request(app).get("/who"), "stable@example.com");
    const second = await identity(request(app).get("/who"), "Stable@Example.com ");
    expect(second.body.userId).toBe(first.body.userId);
  });

  it("maps an existing (imported) user by email instead of creating a new one", async () => {
    const users = new UserRepository(testDb());
    const existing = await users.createWithNewFamily("old@example.com", "$2b$12$hash", "user");
    const res = await identity(request(app).get("/who"), "old@example.com");
    expect(res.body.userId).toBe(existing.id);
  });

  it("defaults a missing or unknown role header to user", async () => {
    const missing = await identity(request(app).get("/who"), "norole@example.com");
    expect(missing.body.role).toBe("user");
    const unknown = await identity(request(app).get("/who"), "norole@example.com", "superuser");
    expect(unknown.body.role).toBe("user");
  });
});

describe("requireAuth (auth disabled)", () => {
  const app = appWith({ disableAuth: true });

  it("falls back to the dev admin when no identity headers are present", async () => {
    const res = await request(app).get("/who");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: DEV_AUTH.USER_ID, role: "admin" });
  });

  it("still resolves identity headers when present (DEV_FAKE_IDENTITY mode)", async () => {
    const res = await identity(request(app).get("/who"), "fake@example.com", "user");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("user");
    expect(res.body.userId).not.toBe(DEV_AUTH.USER_ID);
  });
});

describe("currentUser", () => {
  it("returns req.user when set", () => {
    const user = { userId: "u", role: "admin" };
    expect(currentUser({ user } as never)).toBe(user);
  });

  it("throws 401 when req.user is absent", () => {
    expect(() => currentUser({} as never)).toThrow(HttpError);
  });
});

describe("requireAdmin", () => {
  it("allows admins through", async () => {
    const app = appWith({ disableAuth: true }, true);
    const res = await request(app).get("/who");
    expect(res.status).toBe(200);
  });

  it("403s non-admins", async () => {
    const app = appWith({ disableAuth: false }, true);
    const res = await identity(request(app).get("/who"), "plain@example.com", "user");
    expect(res.status).toBe(403);
  });
});
