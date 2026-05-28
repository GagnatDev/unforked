import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
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
