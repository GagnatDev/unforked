import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { testDb, useCleanDb } from "../test/db.js";

useCleanDb();

const webRoot = fileURLToPath(new URL("../test/fixtures/web", import.meta.url));
const app = buildApp({ db: testDb(), webRoot });

describe("SPA serving", () => {
  it("serves index.html at the root", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await request(app).get("/recipes/123");
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
    expect(res.headers["cache-control"]).toMatch(/no-cache/);
  });

  it("serves hashed assets with a long immutable cache", async () => {
    const res = await request(app).get("/assets/app-abcd1234.js");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/immutable/);
  });

  it("does not shadow /health", async () => {
    const res = await request(app).get("/health");
    expect(res.body).toEqual({ status: "ok" });
  });

  it("does not serve the SPA for /api routes", async () => {
    // /api is guarded by requireAuth, so an unknown path 401s rather than
    // falling through to the index.html catch-all.
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).not.toBe(200);
    expect(res.text).not.toContain('<div id="root">');
  });
});
