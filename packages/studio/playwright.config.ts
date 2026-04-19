import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for HoloScript Studio E2E tests
 *
 * Local: `pnpm dev` (port 3100) or rely on webServer below.
 * Staging: set PLAYWRIGHT_BASE_URL=https://your-studio.example and optionally
 * PLAYWRIGHT_STORAGE_STATE=path/to/auth.json (generate once via `npx playwright codegen` with login).
 *
 * Run: `pnpm exec playwright test` from packages/studio
 */

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // A single Next.js dev-server handles one compilation at a time; parallel
  // workers race on heavy Three.js chunk requests and time out each other.
  // Keep workers=1 in both CI and local runs to serialise page loads.
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
  ],
  // Auto-start dev server when not using an external PLAYWRIGHT_BASE_URL.
  // Skipped if the env var is already set (e.g. CI pointing at a deployed preview).
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://127.0.0.1:3100',
        reuseExistingServer: true,
        timeout: 120_000,
      },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100',
    ...(storageState ? { storageState } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
