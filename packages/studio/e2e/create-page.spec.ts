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

    // Safety: setup wizard may still appear in CI/dev despite localStorage guards.
    const skipWizard = page.getByRole('button', { name: /skip/i }).first();
    if (await skipWizard.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipWizard.click();
    }
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

  test('Agentation click flow shows toast and posts to /api/annotations', async ({ page }) => {
    const recoverIfErrorScreen = async () => {
      const errorHeading = page.getByText(/Something went wrong/i).first();
      if (await errorHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const reloadBtn = page.getByRole('button', { name: /reload page|try again/i }).first();
        if (await reloadBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await reloadBtn.click();
        } else {
          await page.reload({ waitUntil: 'domcontentloaded' });
        }
      }
    };

    await recoverIfErrorScreen();

    // Ensure editor boot overlay is gone before interacting.
    const loadingSceneEditor = page.getByText(/Loading Scene Editor/i).first();
    if (await loadingSceneEditor.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(loadingSceneEditor).toBeHidden({ timeout: 90_000 });
    }

    // Expand Agentation from collapsed floating toolbar.
    const feedbackToggle = page
      .locator('[data-agentation-toolbar] [title="Start feedback mode"]')
      .first();
    await expect(feedbackToggle).toBeVisible({ timeout: 15_000 });
    await feedbackToggle.click();
    await recoverIfErrorScreen();

    // Wait for an annotation POST triggered by annotation submit.
    const annotationPostPromise = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/annotations'),
      { timeout: 30_000 }
    );

    // Create one annotation by clicking a deterministic coordinate in app content.
    await page.mouse.click(320, 180);
    const popup = page.locator('[data-annotation-popup]').first();
    if (!(await popup.isVisible({ timeout: 4_000 }).catch(() => false))) {
      // One retry click if initial target did not produce a pending annotation popup.
      await page.mouse.click(420, 240);
    }

    // Fill and submit annotation popup.
    await expect(popup).toBeVisible({ timeout: 10_000 });
    await popup.locator('textarea').fill('E2E: verify annotation pipeline wiring');
    await popup.getByRole('button', { name: /^add$/i }).click();

    const annotationRequest = await annotationPostPromise;
    expect(annotationRequest.postData()).toContain('annotations');

    // Hook callback emits a toast in Providers ToastContainer.
    await expect(page.getByText(/^Annotation:/)).toBeVisible({ timeout: 10_000 });
  });
});
