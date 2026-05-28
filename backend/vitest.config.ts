import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Testcontainers + pg behave more predictably with process isolation.
    pool: "forks",
    // Defaults so unit tests can import modules that read config at load time
    // without a real database or secret. Integration tests (commit 3+) override
    // DATABASE_URL via a Testcontainers global setup.
    env: {
      JWT_SECRET: "test-secret",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      DISABLE_AUTH: "true",
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
