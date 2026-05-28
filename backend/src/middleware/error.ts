import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";

/** Throw to return a structured `{ error }` response with a specific status. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Terminal error handler. Converges on the dominant `{ error: string }` shape.
 * Unexpected errors are logged server-side (never leaked to the client) and
 * reported as a generic 500 — unlike the Kotlin handler which echoed the
 * exception message in a `detail` field.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error(err, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
