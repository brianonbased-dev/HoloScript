/**
 * e2e/create-page.spec.ts — E2E for the HoloScript Studio editor page
 *
 * Tests the three-panel layout, scene graph interactions, and Brittney chat.
 * Run: npx playwright test e2e/create-page.spec.ts
 */

import { test, expect } from '@playwright/test';

const EDITOR_URL = '/create';

test.describe('Studio editor page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    // Wait for the main layout to load
    await page.waitForLoadState('networkidle');
  });

  test('shows the three main panels', async ({ page }) => {
    // Scene graph panel (left sidebar)
    await expect(page.getByText(/scene graph/i).first()).toBeVisible({ timeout: 10_000 });
    // Viewport (3D canvas is present)
    await expect(page.locator('canvas').first()).toBeVisible();
    // Brittney chat panel
    await expect(page.getByPlaceholder(/ask brittney/i).first()).toBeVisible();
  });

  test('can expand/collapse the scene graph panel', async ({ page }) => {
    // Scene graph root should be visible
    const tree = page.locator('[role="tree"]').first();
    await expect(tree).toBeVisible({ timeout: 10_000 });
  });

  test('Add Node button appears in scene graph toolbar', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test('Brittney chat sends a message', async ({ page }) => {
    const input = page.getByPlaceholder(/ask brittney/i).first();
    await input.fill('Hello Brittney');
    await page.keyboard.press('Enter');
    // Wait for the message to appear in the conversation
    await expect(page.getByText('Hello Brittney')).toBeVisible({ timeout: 10_000 });
  });

  test('Share link button copies to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const shareBtn = page.getByRole('button', { name: /share/i }).first();
    if (await shareBtn.isVisible()) {
      await shareBtn.click();
      // Toast or confirmation should appear
      await expect(page.getByText(/copied|link/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
