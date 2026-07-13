import type { RequestHandler } from "express";
import { API_KEY_PREFIX, hashApiKey, type ApiKeyScope } from "../auth/apiKeys.js";
import type { Db } from "../db/kysely.js";
import { logger } from "../logger.js";
import { ApiKeyRepository, type ApiKeyRow } from "../storage/apiKeyRepository.js";
import { HttpError } from "./error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRow;
    }
  }
}

/**
 * Authenticate a machine-API request solely by `Authorization: Bearer ufk_…`.
 * This middleware never consults the X-Homectl-* identity headers — the machine
 * listener must stay isolated from the header-trusting human surface, so a
 * request that carries only identity headers (no valid key) is rejected.
 *
 * Every failure mode returns the same 401 body (no oracle detail); failures are
 * logged without the presented credential.
 */
export function requireApiKey(db: Db): RequestHandler {
  const keys = new ApiKeyRepository(db);
  const reject = (res: Parameters<RequestHandler>[1], reason: string, path: string): void => {
    logger.warn({ path, reason }, "machine API key auth failed");
    res.status(401).json({ error: "Invalid API key" });
  };

  return async (req, res, next) => {
    const header = req.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
    if (!token || !token.startsWith(API_KEY_PREFIX)) {
      reject(res, "missing or malformed bearer token", req.path);
      return;
    }
    try {
      const row = await keys.findByHash(hashApiKey(token));
      if (!row) {
        reject(res, "unknown key", req.path);
        return;
      }
      if (row.revoked_at) {
        reject(res, "revoked key", req.path);
        return;
      }
      if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
        reject(res, "expired key", req.path);
        return;
      }
      // Populate req.user like requireAuth does, so requireUserAndFamily and the
      // service layer below work unchanged. Machine keys never carry admin.
      req.user = { userId: row.user_id, role: "user" };
      req.apiKey = row;
      await keys.touchLastUsed(row.id);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Gate a machine route on a key scope (F4: read-only keys get their write
 * operations rejected). Unlike auth failures, this is a 403 that *names* the
 * missing scope — the caller is already authenticated, so there is no oracle
 * to protect and the message tells the key owner exactly what to fix.
 */
export function requireScope(scope: ApiKeyScope): RequestHandler {
  return (req, res, next) => {
    if (!currentApiKey(req).scopes.includes(scope)) {
      res.status(403).json({ error: `This API key does not have the '${scope}' scope` });
      return;
    }
    next();
  };
}

/** Read the authenticated key row, asserting requireApiKey ran first. */
export function currentApiKey(req: Parameters<RequestHandler>[0]): ApiKeyRow {
  if (!req.apiKey) throw new HttpError(401, "Invalid API key");
  return req.apiKey;
}
