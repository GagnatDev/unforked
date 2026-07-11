import { describe, expect, it } from "vitest";
import { DEV_JWT_SECRET, loadEnv } from "./env.js";

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

  it("exposes DATABASE_URL as databaseUrl", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://u:p@db:5432/unforked",
      JWT_SECRET: "strong",
    });
    expect(env.databaseUrl).toBe("postgresql://u:p@db:5432/unforked");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({ JWT_SECRET: "strong" })).toThrow();
  });
});
