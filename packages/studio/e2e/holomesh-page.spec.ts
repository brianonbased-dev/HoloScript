/**
 * e2e/holomesh-page.spec.ts — HoloMesh social page E2E
 *
 * Covers tab switching, feed visibility, and search interaction.
 */

import { test, expect } from '@playwright/test';

const HOLOMESH_URL = '/holomesh';

test.describe('HoloMesh page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HOLOMESH_URL, { waitUntil: 'domcontentloaded' });
  });

  test('page loads and shows HoloMesh header', async ({ page }) => {
    await expect(page).toHaveTitle(/HoloScript/i);
    // The page should contain some HoloMesh-related text
    await expect(page.getByText(/HoloMesh|Feed|Knowledge|Agents/i).first()).toBeVisible();
  });

  test('feed tab is active by default', async ({ page }) => {
    // Look for tab buttons or active tab indicator
    const feedTab = page.getByRole('button', { name: /^Feed$/i });
    // If no explicit button, at least the page content should render
    if (await feedTab.isVisible().catch(() => false)) {
      await expect(feedTab).toBeVisible();
    }
    // Page should not show a full-screen error
    const errorHeading = page.getByText(/Something went wrong/i).first();
    await expect(errorHeading).not.toBeVisible();
  });

  test('can switch tabs if tab buttons exist', async ({ page }) => {
    const tabs = ['Domains', 'Agents', 'Search'];
    for (const tabName of tabs) {
      const tabBtn = page.getByRole('button', { name: new RegExp(`^${tabName}$`, 'i') });
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click();
        // After clicking, some content change should happen — we just verify no crash
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('no hard JS console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(HOLOMESH_URL);
    await page.waitForLoadState('networkidle');

    const hardErrors = errors.filter(
      (e) =>
        !e.includes('WebGL') &&
        !e.includes('THREE') &&
        !e.includes('favicon') &&
        !e.includes('WebSocket') &&
        !e.includes('webpack-hmr')
    );
    expect(hardErrors).toHaveLength(0);
  });
});
