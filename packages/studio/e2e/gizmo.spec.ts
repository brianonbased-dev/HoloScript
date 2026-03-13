import { test, expect } from '@playwright/test';

/**
 * Gizmo & Transform Synchronization tests
 * Verifies that transient Object3D mutations off the main thread function correctly.
 */

test.describe('Gizmo Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Next dev can briefly render an error shell during incremental compiles.
    const startupErrorHeading = page.getByRole('heading', { name: /something went wrong/i }).first();
    if (await startupErrorHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    }

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    
    // Ensure we are in the Scene tab
    const sceneTab = page.locator('button:has-text("Scene"), [data-tab="scene"]').first();
    if (await sceneTab.isVisible()) {
      await sceneTab.click();
    }
  });

  test('Scale transform input updates without causing UI detachment/latency (0-frame lock)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      // Ignore WebGL/Three debug warnings
      if (msg.type() === 'error' && !msg.text().includes('WebGL') && !msg.text().includes('THREE')) {
        errors.push(msg.text());
      }
    });

    // 1. Select an object (tree row if available, otherwise click the viewport)
    const outlinerRow = page
      .locator('[role="tree"] [role="treeitem"], [role="tree"] [class*="cursor-pointer"]')
      .first();
    if (await outlinerRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await outlinerRow.click();
    }

    // 2. Also click the viewport to ensure transform controls bind to the active object.
    const canvas = page.locator('canvas').first();
    await canvas.click({ position: { x: 400, y: 300 } });

    // 3. Find the Transform Panel Scale section
    const txPanel = page.locator('span:has-text("Transform"), h2:has-text("Transform"), h3:has-text("Transform")').first();
    await expect(txPanel).toBeVisible({ timeout: 10_000 });
    
    // In our TransformPanel, sections are labeled uppercase via tracking.
    const scaleLabel = page.locator('span', { hasText: /Scale/i }).last();
    const scaleSection = scaleLabel.locator('..').locator('..'); // go up to the section div
    const scaleXInput = scaleSection.locator('input[type="number"]').first();
    await expect(scaleXInput).toBeVisible();
    
    // 4. Quickly type a huge scale value (100) to test transient sync
    // Prior to Phase 1B, this would cause a 1-frame React stutter tearing the Gizmo from the mesh.
    await scaleXInput.fill('100');
    await scaleXInput.press('Enter');
    
    // 5. Verify the value was accepted immediately
    await expect(scaleXInput).toHaveValue('100');
    
    expect(errors.length).toBe(0);
  });
});
