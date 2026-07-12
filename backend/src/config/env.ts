import { z } from "zod";

/** Parse the Kotlin-compatible `"true"`/`"false"` flag semantics (case-insensitive). */
const boolFlag = z
  .string()
  .optional()
  .transform((v) => v?.toLowerCase() === "true");

const EnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    // The machine API listener (docs/aivo-integration.md). Serves only the
    // API-key-authenticated /machine/v1 routes; must never be exposed through
    // the auth-proxy sidecar or any Ingress.
    MACHINE_PORT: z.coerce.number().int().positive().default(8081),
    DATABASE_URL: z.string().min(1),
    // homectl-auth: used only for the one-time user import at boot. Identity at
    // request time comes from the sidecar's X-Homectl-* headers and needs no config.
    AUTH_CLIENT_ID: z.string().min(1).optional(),
    AUTH_CLIENT_SECRET: z.string().min(1).optional(),
    INTERNAL_AUTH_URL: z.string().url().optional(),
    DISABLE_AUTH: boolFlag,
    SEED_TEST_DATA: boolFlag,
    CORS_ORIGIN: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const importVars = [env.AUTH_CLIENT_ID, env.AUTH_CLIENT_SECRET, env.INTERNAL_AUTH_URL];
    const set = importVars.filter((v) => v !== undefined).length;
    if (set > 0 && set < importVars.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_CLIENT_ID"],
        message:
          "AUTH_CLIENT_ID, AUTH_CLIENT_SECRET and INTERNAL_AUTH_URL must be set together (homectl-auth user import)",
      });
    }
  });

export type RawEnv = z.infer<typeof EnvSchema>;
export type Env = RawEnv & { databaseUrl: string };

/** Config for the one-time homectl-auth user import; null when not configured. */
export interface HomectlImportConfig {
  internalAuthUrl: string;
  clientId: string;
  clientSecret: string;
}

export function homectlImportConfig(source: {
  AUTH_CLIENT_ID?: string;
  AUTH_CLIENT_SECRET?: string;
  INTERNAL_AUTH_URL?: string;
}): HomectlImportConfig | null {
  if (!source.AUTH_CLIENT_ID || !source.AUTH_CLIENT_SECRET || !source.INTERNAL_AUTH_URL) {
    return null;
  }
  return {
    internalAuthUrl: source.INTERNAL_AUTH_URL.replace(/\/+$/, ""),
    clientId: source.AUTH_CLIENT_ID,
    clientSecret: source.AUTH_CLIENT_SECRET,
  };
}

/** Validate and normalize the environment. Throws (fail fast) on misconfiguration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.parse(source);
  return { ...parsed, databaseUrl: parsed.DATABASE_URL };
}

export const env: Env = loadEnv();
