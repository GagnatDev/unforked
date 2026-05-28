import { lookup } from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import type { ImportRecipeResponse, RecipeDoc } from "../domain/types.js";
import { parse } from "./bestEffortParsers.js";

const MAX_HTML_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "meal-planning-app/recipe-import (+https://example.invalid)";
const ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/**
 * Fetch a public URL and best-effort extract a recipe. Ported 1:1 from the
 * Kotlin RecipeImporter, including the SSRF guard (reject loopback/link-local/
 * private/any-local resolved addresses), the 2 MB streaming body cap, the 15 s
 * timeout, and the custom User-Agent/Accept headers. Throws on invalid/blocked
 * URLs or oversized responses; the route maps any throw to a 400.
 */
export async function importFromUrl(rawUrl: string): Promise<ImportRecipeResponse> {
  const url = await validatePublicUrl(rawUrl);
  const host = new URL(url).host;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: ACCEPT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return {
      doc: emptyDoc(url, host),
      warnings: [`HTTP ${response.status} while fetching page.`],
    };
  }

  const html = await readBodyCapped(response, MAX_HTML_BYTES);
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const parsed = parse($, warnings);

  const finalDoc: RecipeDoc = {
    ...parsed,
    sourceUrl: url,
    sourceName: parsed.sourceName ?? metaSiteName($) ?? host,
  };

  if (!finalDoc.name.trim()) warnings.push("Could not reliably detect a recipe title.");
  if (finalDoc.ingredients.length === 0) warnings.push("Could not reliably detect ingredients.");
  if (finalDoc.steps.length === 0) warnings.push("Could not reliably detect steps.");

  return { doc: finalDoc, warnings: [...new Set(warnings)] };
}

function emptyDoc(url: string, host: string): RecipeDoc {
  return {
    name: "",
    description: "",
    sourceUrl: url,
    sourceName: host,
    ingredients: [],
    steps: [],
    servings: 4,
    tags: [],
  };
}

function metaSiteName($: cheerio.CheerioAPI): string | null {
  const content = $('meta[property="og:site_name"]').attr("content");
  return content === undefined ? null : content.trim();
}

async function validatePublicUrl(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Invalid URL");
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    throw new Error("Only http/https URLs are supported");
  }
  // URL already converts IDN hosts to punycode in `hostname`.
  const host = url.hostname;
  if (!host) throw new Error("URL must include a host");

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    addresses = [];
  }
  if (addresses.length === 0) throw new Error("Could not resolve host");
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new Error("Refusing to fetch non-public addresses");
  }
  return url.toString();
}

/** Block loopback, any-local, link-local, and private/ULA addresses (v4 + v6). */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true;
}

function isBlockedV4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 (incl. any-local)
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) — classify by the embedded v4 address.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (mapped) return isBlockedV4(mapped[1]);
  if (lower === "::1" || lower === "::") return true; // loopback / any-local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  if (lower.startsWith("fec0")) return true; // deprecated site-local
  return false;
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
