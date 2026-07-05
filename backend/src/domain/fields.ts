import { z } from "zod";

// Shared request-field schemas. Email is trimmed + lowercased before the
// non-empty check, matching the Kotlin normalization (trim().lowercase()).
export const emailField = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().min(1, "Email required"));

export const passwordField = z.string().min(1, "Password required");

export const tokenField = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Token required"));

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}
