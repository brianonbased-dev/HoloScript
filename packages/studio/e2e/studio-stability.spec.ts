/**
 * e2e/studio-stability.spec.ts - Creator Advocate audit 2026-10-14, item 7.
 * /create must not request /holoscript_wasm_bg.wasm (404 on every load) and
 * the Trait Inspector must not hit its error boundary (TRAIT_EFFECTS was never
 * initialised because bundlers dropped core's lazy-init calls).
 */
import { test, expect } from '@playwright/test';

test.describe('Studio stability (audit item 7)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('/create: no root wasm fetch and no Trait Inspector crash', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
      localStorage.setItem('studio-wizard-seen', '1');
    });
    const wasmRequests: string[] = [];
    const boundaryErrors: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('holoscript_wasm_bg.wasm')) wasmRequests.push(r.url());
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('[ErrorBoundary:Trait Inspector]')) {
        boundaryErrors.push(m.text().slice(0, 200));
      }
    });
    await page.goto('/create', { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(8_000);
    expect(wasmRequests).toEqual([]);
    expect(boundaryErrors).toEqual([]);
  });
});