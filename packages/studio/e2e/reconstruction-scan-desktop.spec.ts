import { test, expect } from '@playwright/test';

/**
 * Desktop /scan-room path — requires a saved auth session.
 *
 * Generate once (from packages/studio):
 *   set PLAYWRIGHT_BASE_URL=https://staging.example
 *   npx playwright codegen %PLAYWRIGHT_BASE_URL%/scan-room
 * Sign in, then save storage to e2e/.auth/studio.json and:
 *   set PLAYWRIGHT_STORAGE_STATE=e2e/.auth/studio.json
 *
 * Or omit PLAYWRIGHT_STORAGE_STATE to skip (API/mobile tests still run in reconstruction-scan-happy.spec.ts).
 */
const hasAuthState = !!process.env.PLAYWRIGHT_STORAGE_STATE?.trim();

test.describe('Reconstruction scan desktop (authenticated)', () => {
  test.skip(!hasAuthState, 'Set PLAYWRIGHT_STORAGE_STATE to a saved login JSON to run desktop scan-room E2E.');

  test('scan-room shows session panel after auth', async ({ page }) => {
    await page.goto('/scan-room');
    await expect(page.getByRole('heading', { name: /Mobile Room Scan/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Room Scan \(Desktop → Phone\)/i)).toBeVisible({ timeout: 15_000 });
  });
});
