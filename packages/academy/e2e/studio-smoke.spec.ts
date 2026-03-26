import { test, expect } from '@playwright/test';

/**
 * Studio smoke tests — verifies the main /create page loads correctly
 */

test.describe('Studio Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle(/HoloScript/i);
  });

  test('studio header is visible', async ({ page }) => {
    // Header bar with HoloScript logo / branding
    const header = page.locator('header, [data-testid="studio-header"]').first();
    await expect(header).toBeVisible({ timeout: 15_000 });
  });

  test('viewport canvas renders', async ({ page }) => {
    // Three.js mounts a <canvas>
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20_000 });
  });

  test('scene graph panel is visible', async ({ page }) => {
    // Left panel should show some scene graph structure
    const panel = page.locator('text=Scene').first();
    await expect(panel).toBeVisible({ timeout: 10_000 });
  });

  test('no JS console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    // Allow WebGL warnings but not hard errors
    const hardErrors = errors.filter(
      (e) => !e.includes('WebGL') && !e.includes('THREE') && !e.includes('canvas')
    );
    expect(hardErrors).toHaveLength(0);
  });
});
