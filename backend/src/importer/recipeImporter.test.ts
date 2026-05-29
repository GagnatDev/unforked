import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "node:dns/promises";
import { importFromUrl, isBlockedAddress } from "./recipeImporter.js";

const mockLookup = vi.mocked(lookup);

function resolvesTo(address: string): void {
  // @ts-expect-error simplified LookupAddress shape for the test
  mockLookup.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
}

function stubFetch(response: Response): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

beforeEach(() => {
  mockLookup.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.5.5",
    "192.168.0.1",
    "169.254.1.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "allows public %s",
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});

describe("importFromUrl SSRF guard", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(importFromUrl("ftp://example.com/x")).rejects.toThrow(/http/i);
  });

  it("rejects resolved loopback addresses", async () => {
    resolvesTo("127.0.0.1");
    await expect(importFromUrl("http://sneaky.test/")).rejects.toThrow(/non-public/i);
  });

  it("rejects resolved private addresses", async () => {
    resolvesTo("10.0.0.5");
    await expect(importFromUrl("http://sneaky.test/")).rejects.toThrow(/non-public/i);
  });

  it("rejects an unresolvable host", async () => {
    // @ts-expect-error empty resolution
    mockLookup.mockResolvedValue([]);
    await expect(importFromUrl("http://nope.test/")).rejects.toThrow(/resolve/i);
  });
});

describe("importFromUrl fetching", () => {
  const jsonld = readFileSync(
    new URL("../test/fixtures/importer/jsonld-recipe-only.html", import.meta.url),
    "utf8",
  );

  it("parses a fetched JSON-LD page and sets sourceUrl", async () => {
    resolvesTo("93.184.216.34");
    stubFetch(new Response(jsonld, { status: 200 }));
    const result = await importFromUrl("http://example.test/recipes/soup");
    expect(result.doc.name).toBe("JSON-LD Test Soup");
    expect(result.doc.sourceUrl).toBe("http://example.test/recipes/soup");
    expect(result.doc.ingredients.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings).toEqual([]);
  });

  it("returns a warning on a non-2xx response", async () => {
    resolvesTo("93.184.216.34");
    stubFetch(new Response("", { status: 404 }));
    const result = await importFromUrl("http://example.test/missing");
    expect(result.doc.name).toBe("");
    expect(result.warnings[0]).toMatch(/HTTP 404/);
  });
});
