import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT ?? 4317)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: "e2e",
  // `.e2e.ts` keeps these out of `bun test`, which also runs `*.spec.ts`.
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  // The Vite dev server (with React StrictMode) is slower than production.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // Starts the Vite + Wrangler dev server (tests mock /api, so no D1 data) unless E2E_BASE_URL
  // points at an already running server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `bun run dev --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
