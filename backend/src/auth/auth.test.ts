import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.js";

// vitest config sets JWT_SECRET=test-secret; issuer/audience default to app.meals.
const secret = new TextEncoder().encode("test-secret");

describe("token sign/verify", () => {
  it("round-trips userId and role", async () => {
    const token = await signToken("user-1", "admin");
    expect(await verifyToken(token)).toEqual({ userId: "user-1", role: "admin" });
  });

  it("defaults role to user when the claim is absent", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-2")
      .setIssuer("app.meals")
      .setAudience("app.meals")
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyToken(token)).toEqual({ userId: "user-2", role: "user" });
  });

  it("rejects garbage", async () => {
    expect(await verifyToken("not-a-token")).toBeNull();
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-3")
      .setIssuer("evil")
      .setAudience("app.meals")
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyToken(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-4")
      .setIssuer("app.meals")
      .setAudience("app.meals")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await verifyToken(token)).toBeNull();
  });

  it("rejects a token with no subject", async () => {
    const token = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("app.meals")
      .setAudience("app.meals")
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyToken(token)).toBeNull();
  });
});

describe("password hashing", () => {
  it("hashes and verifies a round-trip", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("verifies an externally-produced bcrypt hash (cross-impl compatibility)", async () => {
    // Canonical OpenBSD bcrypt test vector — not produced by bcryptjs — standing
    // in for a hash written by the Kotlin at.favre bcrypt lib.
    const hash = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";
    expect(await verifyPassword("U*U", hash)).toBe(true);
    expect(await verifyPassword("nope", hash)).toBe(false);
  });
});
