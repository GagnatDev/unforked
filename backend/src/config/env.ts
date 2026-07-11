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
    DATABASE_URL: z.string().min(1),
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

/** Validate and normalize the environment. Throws (fail fast) on misconfiguration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.parse(source);
  return { ...parsed, databaseUrl: parsed.DATABASE_URL };
}

export const env: Env = loadEnv();
