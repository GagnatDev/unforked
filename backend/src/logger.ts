import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";

// Redact secrets from request logs. pino's redact paths cover the Authorization
// header and any `password`/`token` fields at the top level or one level deep.
const redact = [
  "req.headers.authorization",
  "password",
  "token",
  "*.password",
  "*.token",
];

function resolveLevel(): string {
  if (env.NODE_ENV === "test") return "silent";
  if (env.LOG_LEVEL) return env.LOG_LEVEL;
  return env.NODE_ENV === "production" ? "info" : "debug";
}

// Pretty output only in local dev. In production (and tests) we emit plain JSON
// with no transport, so nothing relies on pino's worker-thread machinery — which
// also keeps the tsup bundle self-contained.
const usePretty = env.NODE_ENV === "development";

export const logger = pino({
  level: resolveLevel(),
  redact,
  ...(usePretty
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

// Kubernetes probes hit /health every few seconds, which drowns the log in
// noise. Stay silent for successful probes, but keep failures visible.
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    if (req.url === "/health") return "silent";
    return "info";
  },
});
