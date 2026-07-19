import { describe, expect, it } from "vitest";
import { homectlImportConfig, loadEnv, s3Config } from "./env.js";

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

  it("rejects a partial S3 config", () => {
    expect(() => loadEnv({ ...base, S3_BUCKET: "homectl-unforked" })).toThrow(
      /must be set together/,
    );
  });
});

describe("s3Config", () => {
  it("returns null when not configured", () => {
    expect(s3Config({})).toBeNull();
  });

  it("builds the config and trims trailing slashes off the endpoint", () => {
    const cfg = s3Config({
      S3_BUCKET: "homectl-unforked",
      S3_REGION: "fr-par",
      S3_ENDPOINT: "https://s3.fr-par.scw.cloud/",
      S3_ACCESS_KEY: "AK",
      S3_SECRET_KEY: "SK",
    });
    expect(cfg).toEqual({
      bucket: "homectl-unforked",
      region: "fr-par",
      endpoint: "https://s3.fr-par.scw.cloud",
      accessKey: "AK",
      secretKey: "SK",
    });
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
