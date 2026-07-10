import { readFileSync } from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "node:dns/promises";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

const mockLookup = vi.mocked(lookup);
useCleanDb();
const app = buildTestApp();

let token: TestIdentity;
beforeEach(async () => {
  mockLookup.mockReset();
  token = await setupAdmin(app);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/recipes/import", () => {
  it("imports a recipe from a fetched page", async () => {
    // @ts-expect-error simplified LookupAddress
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const jsonld = readFileSync(
      new URL("../test/fixtures/importer/jsonld-recipe-only.html", import.meta.url),
      "utf8",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(jsonld, { status: 200 }));

    const res = await withAuth(request(app).post("/api/recipes/import"), token).send({
      url: "http://example.test/recipes/soup",
    });
    expect(res.status).toBe(200);
    expect(res.body.doc.name).toBe("JSON-LD Test Soup");
    expect(res.body.doc.sourceUrl).toBe("http://example.test/recipes/soup");
  });

  it("400s a blocked (SSRF) target", async () => {
    // @ts-expect-error simplified LookupAddress
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const res = await withAuth(request(app).post("/api/recipes/import"), token).send({
      url: "http://localhost/",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-public/i);
  });

  it("401s without a token", async () => {
    const res = await request(app).post("/api/recipes/import").send({ url: "http://example.test/" });
    expect(res.status).toBe(401);
  });
});
