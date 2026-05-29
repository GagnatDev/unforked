import { z } from "zod";

// Shared request-field schemas. Email is trimmed + lowercased before the
// non-empty check, matching the Kotlin normalization (trim().lowercase()).
export const emailField = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().min(1, "Email required"));

export const passwordField = z.string().min(1, "Password required");
