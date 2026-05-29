import { describe, expect, it } from "vitest";
import { DEV_JWT_SECRET, loadEnv, resolveDatabaseUrl } from "./env.js";

describe("resolveDatabaseUrl", () => {
  it("prefers an explicit DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgresql://a:b@host/db" })).toBe(
      "postgresql://a:b@host/db",
    );
  });

  it("strips the jdbc: prefix and injects credentials from the legacy DB_URL", () => {
    expect(
      resolveDatabaseUrl({
        DB_URL: "jdbc:postgresql://db:5432/unforked",
        DB_USER: "meals",
        DB_PASSWORD: "secret",
      }),
    ).toBe("postgresql://meals:secret@db:5432/unforked");
  });

  it("passes query params through verbatim", () => {
    expect(
      resolveDatabaseUrl({ DB_URL: "jdbc:postgresql://db:5432/unforked?sslmode=require" }),
    ).toContain("sslmode=require");
  });

  it("throws when neither DATABASE_URL nor DB_URL is set", () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/not configured/i);
  });
});

describe("loadEnv", () => {
  const base = { JWT_SECRET: "strong-secret", DATABASE_URL: "postgresql://a:b@host/db" };

  it("parses Kotlin-compatible boolean flags", () => {
    expect(loadEnv({ ...base, DISABLE_AUTH: "true" }).DISABLE_AUTH).toBe(true);
    expect(loadEnv({ ...base, DISABLE_AUTH: "TRUE" }).DISABLE_AUTH).toBe(true);
    expect(loadEnv({ ...base, DISABLE_AUTH: "false" }).DISABLE_AUTH).toBe(false);
    expect(loadEnv({ ...base }).DISABLE_AUTH).toBe(false);
    expect(loadEnv({ ...base }).SEED_TEST_DATA).toBe(false);
  });

  it("defaults PORT, issuer, and audience", () => {
    const env = loadEnv({ ...base });
    expect(env.PORT).toBe(8080);
    expect(env.JWT_ISSUER).toBe("app.meals");
    expect(env.JWT_AUDIENCE).toBe("app.meals");
  });

  it("rejects the dev JWT secret in production", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", JWT_SECRET: DEV_JWT_SECRET }),
    ).toThrow(/JWT_SECRET/);
  });

  it("exposes the derived databaseUrl", () => {
    const env = loadEnv({
      DB_URL: "jdbc:postgresql://db:5432/unforked",
      DB_USER: "u",
      DB_PASSWORD: "p",
      JWT_SECRET: "strong",
    });
    expect(env.databaseUrl).toBe("postgresql://u:p@db:5432/unforked");
  });
});
