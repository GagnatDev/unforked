/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test'

const backendHost = process.env.E2E_BACKEND_HOST ?? '127.0.0.1'
const backendPort = process.env.E2E_BACKEND_PORT ?? '8080'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: process.env.CI ? 'on-first-retry' : 'off',
  },
  webServer: [
    {
      cwd: '../backend',
      command: './gradlew runE2eBackend',
      url: `http://${backendHost}:${backendPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180 * 1000,
    },
    {
      command: 'VITE_DISABLE_AUTH=true pnpm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
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
