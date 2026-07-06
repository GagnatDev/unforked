import type { Response, RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { isValidUuid } from "../domain/fields.js";
import { HttpError } from "./error.js";

/**
 * Validate (and normalize) the request body against a Zod schema. On failure,
 * responds 400 with `{ error: "Validation failed: <first-issue-message>" }`.
 * The parsed/normalized value replaces req.body.
 */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0]?.message ?? "invalid request body";
      next(new HttpError(400, `Validation failed: ${first}`));
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Validate a UUID path param, responding 400 on failure. Returns null if invalid. */
export function requireUuidParam(
  raw: string | string[] | undefined,
  res: Response,
  paramName = "id",
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && isValidUuid(value)) return value;
  res.status(400).json({ error: `Invalid UUID for parameter '${paramName}'` });
  return null;
}
