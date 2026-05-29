import type { CheerioAPI } from "cheerio";
import type { RecipeDoc } from "../domain/types.js";
import { parseLine } from "./ingredientLineParser.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function metaContent($: CheerioAPI, selector: string): string | null {
  const content = $(selector).attr("content");
  return content === undefined ? null : content.trim();
}

/**
 * Extract a RecipeDoc from a parsed HTML document: JSON-LD (schema.org Recipe)
 * first, then OpenGraph/meta fallback. Ported from the Kotlin BestEffortParsers.
 */
export function parse($: CheerioAPI, warnings: string[]): RecipeDoc {
  const fromJsonLd = parseFromJsonLd($, warnings);
  if (fromJsonLd) return fromJsonLd;

  const docTitle = $("title").text().trim();
  const title = metaContent($, 'meta[property="og:title"]') ?? (docTitle || null);
  const description =
    metaContent($, 'meta[property="og:description"]') ?? metaContent($, 'meta[name="description"]');

  return {
    name: title ?? "",
    description: description ?? "",
    sourceName: metaContent($, 'meta[property="og:site_name"]'),
    ingredients: [],
    steps: [],
    servings: 4,
    tags: [],
  };
}

function parseFromJsonLd($: CheerioAPI, warnings: string[]): RecipeDoc | null {
  const scripts = $('script[type="application/ld+json"]');
  if (scripts.length === 0) return null;

  const elements: unknown[] = [];
  scripts.each((_, el) => {
    const raw = ($(el).text() || $(el).html() || "").trim();
    if (!raw) return;
    try {
      elements.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });
  if (elements.length === 0) return null;

  const recipe = elements.flatMap(extractRecipeObjects)[0];
  if (!recipe) return null;

  const name = asString(recipe["name"])?.trim() ?? "";
  const description = asString(recipe["description"])?.trim() ?? "";
  const ingredients = parseIngredients(recipe["recipeIngredient"]).map(parseLine);
  const steps = parseInstructions(recipe["recipeInstructions"])
    .map((s) => s.trim())
    .filter(Boolean);
  const servings = parseFirstInt(asString(recipe["recipeYield"]) ?? "");
  const publisher = recipe["publisher"];
  const sourceName = isObject(publisher) ? (asString(publisher["name"])?.trim() ?? null) : null;

  if (ingredients.length === 0) warnings.push("JSON-LD present but no ingredients found.");
  if (steps.length === 0) warnings.push("JSON-LD present but no instructions found.");

  return {
    name,
    description,
    ingredients,
    steps,
    servings: servings ?? 4,
    sourceName,
    tags: [],
  };
}

function extractRecipeObjects(root: unknown): JsonObject[] {
  if (Array.isArray(root)) return root.flatMap(extractRecipeObjects);
  if (isObject(root)) {
    const direct = isRecipeType(root) ? [root] : [];
    const graph = "@graph" in root ? extractRecipeObjects(root["@graph"]) : [];
    return [...direct, ...graph];
  }
  return [];
}

function isRecipeType(obj: JsonObject): boolean {
  const type = obj["@type"];
  const types =
    typeof type === "string"
      ? [type]
      : Array.isArray(type)
        ? type.filter((t): t is string => typeof t === "string")
        : [];
  return types.some((t) => t.toLowerCase() === "recipe");
}

function parseIngredients(el: unknown): string[] {
  const splitLines = (s: string): string[] =>
    s
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  if (Array.isArray(el)) {
    return el.flatMap((item) => {
      const s = asString(item)?.trim();
      return s ? splitLines(s) : [];
    });
  }
  const single = asString(el)?.trim();
  return single ? splitLines(single) : [];
}

function parseInstructions(el: unknown): string[] {
  if (typeof el === "string") return el.split("\n").map((s) => s.trim());
  if (Array.isArray(el)) return el.flatMap(parseInstructions);
  if (isObject(el)) {
    const text = asString(el["text"]);
    return text && text.trim() ? [text] : [];
  }
  return [];
}

function parseFirstInt(s: string): number | null {
  const match = /(\d+)/.exec(s);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}
