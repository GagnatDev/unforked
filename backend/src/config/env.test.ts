import { describe, expect, it } from "vitest";
import { homectlImportConfig, loadEnv } from "./env.js";

describe("loadEnv", () => {
  const base = { DATABASE_URL: "postgresql://a:b@host/db" };

  it("parses Kotlin-compatible boolean flags", () => {
    expect(loadEnv({ ...base, DISABLE_AUTH: "true" }).DISABLE_AUTH).toBe(true);
    expect(loadEnv({ ...base, DISABLE_AUTH: "TRUE" }).DISABLE_AUTH).toBe(true);
    expect(loadEnv({ ...base, DISABLE_AUTH: "false" }).DISABLE_AUTH).toBe(false);
    expect(loadEnv({ ...base }).DISABLE_AUTH).toBe(false);
    expect(loadEnv({ ...base }).SEED_TEST_DATA).toBe(false);
  });

  it("defaults PORT", () => {
    expect(loadEnv({ ...base }).PORT).toBe(8080);
  });

  it("accepts the full homectl-auth import trio", () => {
    const env = loadEnv({
      ...base,
      AUTH_CLIENT_ID: "unforked",
      AUTH_CLIENT_SECRET: "s3cret",
      INTERNAL_AUTH_URL: "http://homectl-auth.homectl",
    });
    expect(env.AUTH_CLIENT_ID).toBe("unforked");
  });

  it("rejects a partial homectl-auth import config", () => {
    expect(() => loadEnv({ ...base, AUTH_CLIENT_ID: "unforked" })).toThrow(/must be set together/);
  });

  it("exposes DATABASE_URL as databaseUrl", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://u:p@db:5432/unforked",
    });
    expect(env.databaseUrl).toBe("postgresql://u:p@db:5432/unforked");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow();
  });
});

describe("homectlImportConfig", () => {
  it("returns null when the trio is not configured", () => {
    expect(homectlImportConfig({})).toBeNull();
  });

  it("builds the config and trims trailing slashes off the URL", () => {
    expect(
      homectlImportConfig({
        AUTH_CLIENT_ID: "unforked",
        AUTH_CLIENT_SECRET: "s3cret",
        INTERNAL_AUTH_URL: "http://homectl-auth.homectl/",
      }),
    ).toEqual({
      internalAuthUrl: "http://homectl-auth.homectl",
      clientId: "unforked",
      clientSecret: "s3cret",
    });
  });
});
