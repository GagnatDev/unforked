import { describe, expect, it } from "vitest";
import { createS3PhotoStorage } from "./photoStorage.js";

/**
 * Route tests drive PhotoStorage through an in-memory fake, so an AWS SDK
 * bump would not catch a break in presigning or endpoint addressing. These
 * cases mint URLs locally (no network) against the production Scaleway
 * endpoint shape.
 */
const config = {
  bucket: "homectl-unforked",
  region: "fr-par",
  endpoint: "https://s3.fr-par.scw.cloud",
  accessKey: "AKIAFAKEACCESSKEY",
  secretKey: "fakeSecretKeyMustBeLongEnough01",
};

describe("createS3PhotoStorage", () => {
  const storage = createS3PhotoStorage(config);

  it("mints a PUT URL against the custom endpoint without default checksums", async () => {
    const url = await storage.presignUpload("recipes/abc/photo-full.webp", "image/webp");
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe("homectl-unforked.s3.fr-par.scw.cloud");
    expect(parsed.pathname).toBe("/recipes/abc/photo-full.webp");
    // The S3 presigner leaves Content-Type unsigned; Cache-Control must not
    // appear (it would trip a CORS preflight). Default CRC32 checksums must
    // not be baked in — they would be the empty-body digest and fail the
    // browser PUT of the actual JPEG.
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe(String(15 * 60));
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.has("x-amz-checksum-crc32")).toBe(false);
    expect(parsed.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
    expect(url.toLowerCase()).not.toContain("cache-control");
  });

  it("mints a GET URL that can override Cache-Control on the response", async () => {
    const url = await storage.presignDownload(
      "recipes/abc/photo-full.webp",
      3600,
      "public, max-age=31536000, immutable",
    );
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("homectl-unforked.s3.fr-par.scw.cloud");
    expect(parsed.searchParams.get("response-cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(parsed.searchParams.has("x-amz-checksum-mode")).toBe(false);
  });
});
