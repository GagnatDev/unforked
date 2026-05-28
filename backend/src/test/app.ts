import { buildApp } from "../app.js";
import { testDb } from "./db.js";

/** Build the Express app wired to the shared Testcontainers database. */
export function buildTestApp(): ReturnType<typeof buildApp> {
  return buildApp({ db: testDb() });
}
