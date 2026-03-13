/**
 * Playwright global setup — pre-warms the Next.js dev server before any test runs.
 *
 * The /create page dynamically imports heavy Three.js / R3F chunks via next/dynamic
 * (ssr: false). On a cold dev server these take 60-90 s to compile on first request.
 * Running this warm-up once here means every spec file sees a hot server and
 * canvas appears within a few seconds.
 */

import { chromium } from '@playwright/test';

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/create`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Wait for R3F canvas — this is the expensive first-compile step.
    // Once it resolves the chunks are cached by Next.js for all subsequent requests.
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
