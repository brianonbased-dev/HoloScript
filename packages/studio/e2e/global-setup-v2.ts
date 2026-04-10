/**
 * Playwright global setup (v2 cache-bust)
 * Best-effort warm-up: should never fail the run.
 */

import { chromium } from '@playwright/test';

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();

    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.goto(`${baseURL}/create`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 120_000 });
    } catch (err) {
      console.warn('[playwright global-setup-v2] warm-up skipped:', String(err));
    }
  } finally {
    await browser.close();
  }
}
