import { z } from "zod";

/** Insecure placeholder; rejected when NODE_ENV=production (see schema refine). */
export const DEV_JWT_SECRET = "dev-insecure-secret-change-me";

/** Parse the Kotlin-compatible `"true"`/`"false"` flag semantics (case-insensitive). */
const boolFlag = z
  .string()
  .optional()
  .transform((v) => v?.toLowerCase() === "true");

const EnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    // New primary connection var; falls back to the legacy JDBC `DB_URL`.
    DATABASE_URL: z.string().optional(),
    DB_URL: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    JWT_SECRET: z.string().min(1).default(DEV_JWT_SECRET),
    JWT_ISSUER: z.string().default("app.meals"),
    JWT_AUDIENCE: z.string().default("app.meals"),
    DISABLE_AUTH: boolFlag,
    SEED_TEST_DATA: boolFlag,
    CORS_ORIGIN: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be set to a strong value in production",
      });
    }
  });

export type RawEnv = z.infer<typeof EnvSchema>;
export type Env = RawEnv & { databaseUrl: string };

/**
 * Derive a libpq-compatible connection string. Prefers `DATABASE_URL`; otherwise
 * strips the `jdbc:` prefix off the legacy `DB_URL` and injects the separate
 * `DB_USER`/`DB_PASSWORD` credentials (the shape the K8s Secret uses today).
 * Query params are passed through verbatim.
 */
export function resolveDatabaseUrl(input: {
  DATABASE_URL?: string;
  DB_URL?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
}): string {
  if (input.DATABASE_URL) return input.DATABASE_URL;
  if (!input.DB_URL) {
    throw new Error("Database connection not configured: set DATABASE_URL or DB_URL");
  }
  const url = new URL(input.DB_URL.replace(/^jdbc:/, ""));
  if (input.DB_USER) url.username = input.DB_USER;
  if (input.DB_PASSWORD) url.password = input.DB_PASSWORD;
  return url.toString();
}

/** Validate and normalize the environment. Throws (fail fast) on misconfiguration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.parse(source);
  return { ...parsed, databaseUrl: resolveDatabaseUrl(parsed) };
}

export const env: Env = loadEnv();
