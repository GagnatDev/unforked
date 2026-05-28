// Entry point for the Playwright e2e backend.
//
// Commit 12 will provision a Testcontainers Postgres here, run migrations, and
// seed test data so the e2e suite is fully self-contained (matching the current
// Kotlin E2eBackendMain). For now it boots against the configured DATABASE_URL
// with auth disabled.
process.env.DISABLE_AUTH ??= "true";

const { startServer } = await import("./bootstrap.js");
await startServer();
