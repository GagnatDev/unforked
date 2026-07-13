import { Router } from "express";
import { z } from "zod";
import { API_KEY_SCOPES, generateApiKey, hashApiKey } from "../auth/apiKeys.js";
import type { Db } from "../db/kysely.js";
import { currentUser } from "../middleware/auth.js";
import { requireUuidParam, validateBody } from "../middleware/validate.js";
import { ApiKeyRepository, type ApiKeyRow } from "../storage/apiKeyRepository.js";

const createKeySchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name is too long"),
  // Every key can read; "write" additionally unlocks the mutating machine
  // endpoints. Normalized so stored scopes are always ["read"] or ["read","write"].
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .max(API_KEY_SCOPES.length, "unknown scope")
    .default([])
    .transform((scopes) => API_KEY_SCOPES.filter((s) => s === "read" || scopes.includes(s))),
});

/** The wire shape of a key. Never contains the plaintext or the hash. */
function toApiKeyDto(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

/**
 * Machine-API key management, mounted on the *human* API under /api (after
 * requireAuth — issuance stays behind the normal sidecar auth). Keys are
 * per-user: a key acts as its owning user and therefore sees that user's
 * family data. The plaintext is returned exactly once, from the create call.
 */
export function apiKeyRoutes(db: Db): Router {
  const keys = new ApiKeyRepository(db);
  const router = Router();

  router.post("/api-keys", validateBody(createKeySchema), async (req, res) => {
    const { userId } = currentUser(req);
    const { name, scopes } = req.body as z.infer<typeof createKeySchema>;
    const plaintext = generateApiKey();
    const row = await keys.insert({ userId, name, keyHash: hashApiKey(plaintext), scopes });
    // `key` (the plaintext) exists only in this response — it is not stored and
    // cannot be retrieved again.
    res.status(201).json({ ...toApiKeyDto(row), key: plaintext });
  });

  router.get("/api-keys", async (req, res) => {
    const { userId } = currentUser(req);
    res.json((await keys.listByUser(userId)).map(toApiKeyDto));
  });

  // Revoke, not delete: the row (name, last_used_at) stays visible for audit.
  router.delete("/api-keys/:id", async (req, res) => {
    const { userId } = currentUser(req);
    const id = requireUuidParam(req.params.id, res);
    if (!id) return;
    if (!(await keys.revoke(userId, id))) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}
