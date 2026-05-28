import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { signToken } from "../auth/auth.js";
import { DEV_AUTH } from "../auth/auth.js";
import { currentUser, requireAdmin, requireAuth, type RequireAuthOptions } from "./auth.js";
import { HttpError } from "./error.js";

function appWith(opts: RequireAuthOptions, admin = false): Express {
  const app = express();
  const chain = admin ? [requireAuth(opts), requireAdmin()] : [requireAuth(opts)];
  app.get("/who", ...chain, (req, res) => {
    res.json(req.user);
  });
  return app;
}

describe("requireAuth (auth enabled)", () => {
  const app = appWith({ disableAuth: false });

  it("401s when no token is present", async () => {
    const res = await request(app).get("/who");
    expect(res.status).toBe(401);
  });

  it("401s on an invalid token", async () => {
    const res = await request(app).get("/who").set("Authorization", "Bearer nonsense");
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and exposes req.user", async () => {
    const token = await signToken("user-9", "user");
    const res = await request(app).get("/who").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user-9", role: "user" });
  });
});

describe("requireAuth (auth disabled)", () => {
  const app = appWith({ disableAuth: true });

  it("falls back to the dev admin when no token is present", async () => {
    const res = await request(app).get("/who");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: DEV_AUTH.USER_ID, role: "admin" });
  });

  it("still uses a valid token when one is present", async () => {
    const token = await signToken("real-user", "user");
    const res = await request(app).get("/who").set("Authorization", `Bearer ${token}`);
    expect(res.body).toEqual({ userId: "real-user", role: "user" });
  });

  it("still rejects a present-but-invalid token", async () => {
    const res = await request(app).get("/who").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
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
    const token = await signToken("plain", "user");
    const res = await request(app).get("/who").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
