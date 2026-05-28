import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Testcontainers + pg behave more predictably with process isolation.
    pool: "forks",
    // One shared Postgres container for the whole run; migrations applied once.
    globalSetup: ["src/test/global-setup.ts"],
    // Test files share that single database and reset via TRUNCATE between tests,
    // so they must not run concurrently or they'd truncate each other's data.
    fileParallelism: false,
    // Defaults so unit tests can import modules that read config at load time
    // without a real database or secret. Integration tests (commit 3+) override
    // DATABASE_URL via a Testcontainers global setup.
    env: {
      JWT_SECRET: "test-secret",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      // Auth enabled so API tests exercise the real token flow; middleware unit
      // tests inject disableAuth explicitly to cover the DISABLE_AUTH path.
      DISABLE_AUTH: "false",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // Entry points and thin framework wiring are exercised by e2e/integration,
      // not unit tests. Coverage targets business logic.
      exclude: [
        "src/**/*.test.ts",
        "src/server.ts",
        "src/bootstrap.ts",
        "src/e2e-server.ts",
        "src/db/pool.ts",
        "src/db/kysely.ts",
        "src/db/schema.ts",
        "src/db/migrate.ts",
        "src/domain/types.ts",
        "src/logger.ts",
        "src/test/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
