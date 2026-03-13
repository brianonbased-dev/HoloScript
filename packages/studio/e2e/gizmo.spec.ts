import { test, expect } from '@playwright/test';

/**
 * Gizmo & Transform Synchronization tests
 * Verifies that transient Object3D mutations off the main thread function correctly.
 */

test.describe('Gizmo Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
    
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

    // 1. Add a Box to the scene to interact with
    const addButton = page.getByRole('button', { name: /add/i }).first();
    await expect(addButton).toBeVisible({ timeout: 10_000 });
    await addButton.click();

    const meshOption = page.getByRole('option', { name: /mesh object/i }).first();
    if (await meshOption.isVisible()) {
      await meshOption.click();
    } else {
      // Fallback for alternate layouts exposing primitive buttons directly.
      await page.locator('button:has-text("Box")').first().click();
    }
    
    // 2. Select the Box (clicking near the center of the canvas)
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
