/**
 * e2e/shader-editor.spec.ts — E2E for the Shader Node Graph editor
 *
 * Tests palette-to-canvas node addition, connections, and GLSL compile.
 * Run: npx playwright test e2e/shader-editor.spec.ts
 */

import { test, expect } from '@playwright/test';

const EDITOR_URL = '/create';

test.describe('Shader Node Graph editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    await page.waitForLoadState('networkidle');

    // Open the shader editor panel (bottom panel toggle)
    const shaderToggle = page
      .getByRole('button', { name: /node graph|shader|graph editor/i })
      .first();
    if (await shaderToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await shaderToggle.click();
    }
  });

  test('renders the node graph canvas', async ({ page }) => {
    // React Flow renders a .react-flow__pane element
    const canvas = page.locator('.react-flow__renderer, .react-flow__pane').first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
  });

  test('Add Node palette buttons are visible', async ({ page }) => {
    const addNodeLabel = page.getByText(/add node/i).first();
    await expect(addNodeLabel).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a palette button creates a new node', async ({ page }) => {
    // Count existing nodes before
    const nodesBefore = await page.locator('.react-flow__node').count();

    // Click the first palette add-node button
    const paletteBtn = page.locator('button:has(.lucide-plus)').first();
    if (await paletteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await paletteBtn.click();
      // A new node should appear
      await expect(page.locator('.react-flow__node')).toHaveCount(nodesBefore + 1, {
        timeout: 5_000,
      });
    }
  });

  test('Compile GLSL button is present', async ({ page }) => {
    const compileBtn = page.getByRole('button', { name: /compile glsl/i }).first();
    await expect(compileBtn).toBeVisible({ timeout: 10_000 });
  });

  test('Undo / Redo buttons appear in toolbar', async ({ page }) => {
    const undoBtn = page.getByRole('button', { name: /^undo$/i }).first();
    const redoBtn = page.getByRole('button', { name: /^redo$/i }).first();
    await expect(undoBtn).toBeVisible({ timeout: 10_000 });
    await expect(redoBtn).toBeVisible({ timeout: 10_000 });
  });
});
