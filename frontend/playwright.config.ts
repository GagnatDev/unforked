/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test'

const backendHost = process.env.E2E_BACKEND_HOST ?? '127.0.0.1'
/** Default away from 8080 so local `./gradlew run` is not mistaken for the e2e backend when reusing servers. */
const backendPort = process.env.E2E_BACKEND_PORT ?? '18080'
/** Dedicated port avoids reusing a dev Vite that proxies to the wrong API. */
const vitePort = process.env.E2E_VITE_PORT ?? '4174'
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${vitePort}`
const e2eApiOrigin = `http://${backendHost}:${backendPort}`

// Recipe persistence specs are tagged @integration; run mocked-only with --grep-invert @integration
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    /** Assertions assume English UI; locks i18next before first navigation. */
    locale: 'en-US',
    storageState: {
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: 'i18nextLng', value: 'en' }],
        },
      ],
    },
    trace: process.env.CI ? 'on-first-retry' : 'off',
    /** Keeps ISO week / calendar `data-day` aligned with assertions in e2e. */
    timezoneId: 'UTC',
  },
  webServer: [
    {
      // Node backend with a self-provisioned Testcontainers Postgres + DISABLE_AUTH.
      // `pnpm --filter` resolves the workspace root from the frontend dir.
      command: `pnpm --filter @unforked/backend run e2e:server`,
      env: { E2E_BACKEND_HOST: backendHost, E2E_BACKEND_PORT: backendPort },
      url: `http://${backendHost}:${backendPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180 * 1000,
    },
    {
      command: `VITE_DISABLE_AUTH=true VITE_API_URL=${e2eApiOrigin} pnpm exec vite --host 127.0.0.1 --port ${vitePort}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
