import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { parse } from "./bestEffortParsers.js";

function loadFixture(name: string): cheerio.CheerioAPI {
  const html = readFileSync(new URL(`../test/fixtures/importer/${name}`, import.meta.url), "utf8");
  return cheerio.load(html);
}

describe("BestEffortParsers fallback (no JSON-LD)", () => {
  it.each([
    ["import-fixture-grove-pannekaker.html", "grove pannekaker"],
    ["import-fixture-lange-kikertsalat.html", "lange"],
    ["import-fixture-birria-taco.html", "birria"],
  ])("uses the document title for %s", (fixture, expected) => {
    const out = parse(loadFixture(fixture), []);
    expect(out.name.toLowerCase()).toContain(expected);
  });
});

describe("BestEffortParsers JSON-LD", () => {
  it("extracts fields from a schema.org Recipe", () => {
    const out = parse(loadFixture("jsonld-recipe-only.html"), []);
    expect(out.name).toContain("JSON-LD Test Soup");
    expect(out.servings).toBe(4);
    expect(out.ingredients[0]).toEqual({ name: "carrots", quantity: "200", unit: "g" });
    expect(out.ingredients[1]).toEqual({ name: "water", quantity: "1", unit: "l" });
    expect(out.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("splits a single-string recipeIngredient on newlines", () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Recipe","name":"Multiline","recipeIngredient":"1 dl milk\\n200 g flour"}
      </script></head><body></body></html>`;
    const out = parse(cheerio.load(html), []);
    expect(out.ingredients).toEqual([
      { name: "milk", quantity: "1", unit: "dl" },
      { name: "flour", quantity: "200", unit: "g" },
    ]);
  });

  it("finds a Recipe nested in an @graph", () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Graphed","recipeIngredient":["100 g sugar"],"recipeInstructions":[{"@type":"HowToStep","text":"Stir."}]}]}
      </script></head><body></body></html>`;
    const out = parse(cheerio.load(html), []);
    expect(out.name).toBe("Graphed");
    expect(out.ingredients[0]).toEqual({ name: "sugar", quantity: "100", unit: "g" });
  });

  it("pushes warnings when ingredients/instructions are missing", () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@type":"Recipe","name":"Bare"}</script>
      </head><body></body></html>`;
    const warnings: string[] = [];
    parse(cheerio.load(html), warnings);
    expect(warnings).toContain("JSON-LD present but no ingredients found.");
    expect(warnings).toContain("JSON-LD present but no instructions found.");
  });
});
