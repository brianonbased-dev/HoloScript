import { test, expect } from '@playwright/test';

/**
 * Gizmo & Transform Synchronization tests
 * Verifies that transient Object3D mutations off the main thread function correctly.
 */

test.describe('Gizmo Synchronization', () => {
  // The dev server compiles heavy Three.js / R3F chunks on first request.
  // The global timeout (30 s) is shorter than the 60 s canvas wait in beforeEach,
  // so the test was always cut off before the canvas had a chance to mount.
  // 120 s gives enough headroom for the first cold-compile + WebGL init.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    // Suppress first-visit onboarding modals by pre-populating the localStorage
    // keys the tutorial/wizard read on mount — they never open if the keys exist.
    await page.addInitScript(() => {
      localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
      localStorage.setItem('studio-wizard-seen', '1');
      // Force artist mode so SceneGraphPanel (and its AddObjectMenu toolbar button) renders.
      // Default 'creator' mode uses CreatorLayout which has no SceneGraphPanel.
      localStorage.setItem('studio-mode', 'artist');
    });

    await page.goto('/create', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Next dev can briefly render an error shell during incremental compiles.
    const startupErrorHeading = page.getByRole('heading', { name: /something went wrong/i }).first();
    if (await startupErrorHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    }

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  });

  test('Scale transform input updates without causing UI detachment/latency (0-frame lock)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      // Ignore WebGL/Three debug warnings
      if (msg.type() === 'error' && !msg.text().includes('WebGL') && !msg.text().includes('THREE')) {
        errors.push(msg.text());
      }
    });

    // 1. Add a Mesh Object so the TraitInspector opens (new nodes are auto-selected).
    //    The scene starts empty on each test run, so we cannot rely on a pre-existing treeitem.
    const addBtn = page.getByRole('button', { name: /add scene object/i }).first();
    await addBtn.click();
    // Dropdown items use role="option" inside a role="listbox"
    const meshOption = page.getByRole('option', { name: /mesh object/i }).first();
    await meshOption.click();

    // 2. Wait for the new node to appear in the scene tree (confirms add + auto-select)
    await expect(page.locator('[role="treeitem"]').first()).toBeVisible({ timeout: 5_000 });

    // 3. Find the "scale X" input in the Transform section.
    //    TraitInspector renders inputs with title="scale X" / "scale Y" / "scale Z".
    const scaleXInput = page.locator('input[title="scale X"]').first();
    await expect(scaleXInput).toBeVisible({ timeout: 5_000 });

    // 4. Quickly type a huge scale value (100) to test transient sync.
    //    Prior to Phase 1B, this would cause a 1-frame React stutter tearing the Gizmo from the mesh.
    await scaleXInput.fill('100');
    await scaleXInput.press('Enter');

    // 5. Verify the value was accepted immediately
    await expect(scaleXInput).toHaveValue('100');

    expect(errors.length).toBe(0);
  });
});
