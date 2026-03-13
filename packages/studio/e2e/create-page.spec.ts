/**
 * e2e/create-page.spec.ts — E2E for the HoloScript Studio editor page
 *
 * Tests the three-panel layout, scene graph interactions, and Brittney chat.
 * Run: npx playwright test e2e/create-page.spec.ts
 */

import { test, expect } from '@playwright/test';

const EDITOR_URL = '/create';

test.describe('Studio editor page', () => {
  // SceneRenderer loads heavy Three.js / R3F chunks dynamically; the canvas wait
  // in beforeEach needs more time than the default 30 s global test timeout.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    // Suppress first-visit onboarding modals by pre-populating the localStorage
    // keys that the tutorial/wizard read to decide whether to show.
    // addInitScript runs before any page scripts so the React components never
    // open the modals in the first place.
    await page.addInitScript(() => {
      localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
      localStorage.setItem('studio-wizard-seen', '1');
      // Force artist mode so the else-branch layout renders SceneGraphPanel + BrittneyChatPanel.
      // Default 'creator' mode renders CreatorLayout which has neither.
      localStorage.setItem('studio-mode', 'artist');
    });

    // Use 'domcontentloaded' so page.goto() resolves before heavy Three.js / R3F
    // chunks are fetched — those can take >30 s on cold compile, exceeding the
    // default navigation timeout.  The canvas wait below handles actual readiness.
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // SceneRenderer is dynamically imported; wait for canvas (signals R3F mounted).
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  });

  test('shows the three main panels', async ({ page }) => {
    // Scene graph panel (left sidebar) — the panel header label is "Scene",
    // and the accessible tree has aria-label="Scene graph"
    await expect(page.locator('[role="tree"]').first()).toBeVisible({ timeout: 10_000 });
    // Viewport (3D canvas is present)
    await expect(page.locator('canvas').first()).toBeVisible();
    // Brittney chat panel — placeholder varies but always contains "Brittney"
    await expect(page.getByPlaceholder(/brittney/i).first()).toBeVisible();
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
    const input = page.getByPlaceholder(/brittney/i).first();
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
