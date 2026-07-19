import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import type { RecipePhoto } from "../domain/types.js";
import { HttpError } from "../middleware/error.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import type { PhotoStorage } from "../service/photoStorage.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

/** Content types the client compressor may produce (canvas encoders). */
const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/webp"] as const;

const EXTENSIONS: Record<(typeof PHOTO_CONTENT_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Hard cap per object; the client compresses well below this. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// Photo objects get a fresh UUID key on every upload, so they are immutable
// and can be cached hard by browsers and the service worker.
const OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

// The redirect (and thus the presigned GET URL it points to) may be reused for
// half the presign window; the URL stays valid for the full window.
const DOWNLOAD_EXPIRY_SECONDS = 24 * 60 * 60;
const REDIRECT_CACHE_SECONDS = DOWNLOAD_EXPIRY_SECONDS / 2;

const uploadsSchema = z.object({
  contentType: z.enum(PHOTO_CONTENT_TYPES),
});

const attachSchema = z.object({
  key: z.string().min(1).max(512),
  thumbKey: z.string().min(1).max(512),
});

export interface PhotoRouteOptions {
  /** Object storage; undefined/null disables the photo endpoints (dev/test without a bucket). */
  storage?: PhotoStorage | null;
  /** Test seam: shrink the size cap without uploading megabytes. */
  maxBytes?: number;
}

function keyPrefix(recipeId: string): string {
  return `recipes/${recipeId}/`;
}

/** The keys referenced by a doc's photo, in a stable order (full, thumb). */
export function photoKeys(photo: RecipePhoto | null | undefined): string[] {
  return photo ? [photo.key, photo.thumbKey] : [];
}

/**
 * Recipe photo endpoints (mounted under /api behind requireAuth). The photo
 * bytes never pass through the backend: uploads go straight to the bucket via
 * presigned PUTs minted here, and reads redirect to presigned GETs. Without
 * S3 config the routes stay mounted but report the feature as unavailable, so
 * the frontend can gate its UI off one probe of /photos/availability.
 */
export function recipePhotoRoutes(db: Db, options: PhotoRouteOptions = {}): Router {
  const users = new UserRepository(db);
  const recipes = new RecipeRepository(db);
  const storage = options.storage ?? null;
  const maxBytes = options.maxBytes ?? MAX_PHOTO_BYTES;
  const router = Router();

  /** 404 (not 500) when unconfigured: dev and test environments legitimately run without a bucket. */
  function requireStorage(): PhotoStorage {
    if (!storage) throw new HttpError(404, "Photo storage is not configured");
    return storage;
  }

  router.get("/photos/availability", async (req, res) => {
    await requireUserAndFamily(users, req);
    res.json({ available: storage !== null });
  });

  // Mint presigned PUT URLs for one photo (full + thumbnail). The client must
  // upload with exactly the returned headers — they are part of the signature.
  router.post("/recipes/:id/photo/uploads", validateBody(uploadsSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const s3 = requireStorage();
    if (!(await recipes.findById(familyId, id))) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }

    const { contentType } = req.body as z.infer<typeof uploadsSchema>;
    const uploadId = randomUUID();
    const ext = EXTENSIONS[contentType];
    const key = `${keyPrefix(id)}${uploadId}-full.${ext}`;
    const thumbKey = `${keyPrefix(id)}${uploadId}-thumb.${ext}`;
    const [uploadUrl, thumbUploadUrl] = await Promise.all([
      s3.presignUpload(key, contentType, OBJECT_CACHE_CONTROL),
      s3.presignUpload(thumbKey, contentType, OBJECT_CACHE_CONTROL),
    ]);
    res.status(201).json({
      key,
      thumbKey,
      uploadUrl,
      thumbUploadUrl,
      headers: { "Content-Type": contentType, "Cache-Control": OBJECT_CACHE_CONTROL },
      maxBytes,
    });
  });

  // Attach previously uploaded objects to the recipe. Keys must live under
  // this recipe's prefix (so a client can only reference objects minted for a
  // recipe its family owns) and are verified in the bucket before the doc is
  // touched. Replacing a photo deletes the old objects best-effort.
  router.put("/recipes/:id/photo", validateBody(attachSchema), async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const s3 = requireStorage();
    const { key, thumbKey } = req.body as z.infer<typeof attachSchema>;
    if (!key.startsWith(keyPrefix(id)) || !thumbKey.startsWith(keyPrefix(id)) || key === thumbKey) {
      res.status(400).json({ error: "Photo keys do not belong to this recipe" });
      return;
    }
    const existing = await recipes.findById(familyId, id);
    if (!existing) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }

    const stats = await Promise.all([s3.head(key), s3.head(thumbKey)]);
    for (const stat of stats) {
      if (!stat) {
        res.status(400).json({ error: "Photo has not been uploaded" });
        return;
      }
      if (stat.size > maxBytes) {
        // Reject and clean up: the objects were minted for this attach only.
        await s3.deleteAll([key, thumbKey]);
        res.status(400).json({ error: "Photo is too large" });
        return;
      }
      if (stat.contentType && !stat.contentType.startsWith("image/")) {
        await s3.deleteAll([key, thumbKey]);
        res.status(400).json({ error: "Uploaded object is not an image" });
        return;
      }
    }

    const updated = await recipes.setPhoto(familyId, id, { key, thumbKey });
    if (!updated) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const stale = photoKeys(existing.doc.photo).filter((k) => k !== key && k !== thumbKey);
    if (stale.length > 0) await s3.deleteAll(stale);
    res.json({ id, doc: updated.doc, version: updated.version });
  });

  router.delete("/recipes/:id/photo", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const s3 = requireStorage();
    const existing = await recipes.findById(familyId, id);
    if (!existing) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const updated = await recipes.setPhoto(familyId, id, null);
    if (!updated) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const keys = photoKeys(existing.doc.photo);
    if (keys.length > 0) await s3.deleteAll(keys);
    res.json({ id, doc: updated.doc, version: updated.version });
  });

  // <img src> endpoints: redirect to a presigned GET. The redirect itself is
  // cacheable (private: it is minted behind auth) for half the presign window,
  // so repeat views reuse the same bucket URL and hit the browser cache.
  router.get("/recipes/:id/photo/:variant", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    const variant = req.params.variant;
    if (variant !== "full" && variant !== "thumb") {
      res.status(404).json({ error: "Unknown photo variant" });
      return;
    }
    const s3 = requireStorage();
    const found = await recipes.findById(familyId, id);
    if (!found) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const photo = found.doc.photo;
    if (!photo) {
      res.status(404).json({ error: "Recipe has no photo" });
      return;
    }
    const url = await s3.presignDownload(
      variant === "full" ? photo.key : photo.thumbKey,
      DOWNLOAD_EXPIRY_SECONDS,
    );
    res.setHeader("Cache-Control", `private, max-age=${REDIRECT_CACHE_SECONDS}`);
    res.redirect(302, url);
  });

  return router;
}
