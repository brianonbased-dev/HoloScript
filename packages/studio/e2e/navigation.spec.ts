/**
 * e2e/navigation.spec.ts — Cross-page navigation smoke
 *
 * Verifies that major Studio routes load without console errors and that the
 * global navigation links work end-to-end.
 */

import { test, expect } from '@playwright/test';

// Routes that should be reachable without auth (or with local dev bypass)
const PUBLIC_ROUTES = [
  { path: '/create', titleMatch: /HoloScript/i },
  { path: '/avatar', titleMatch: /Avatar Authoring/i },
  { path: '/holomesh', titleMatch: /HoloMesh|HoloScript/i },
  { path: '/agents', titleMatch: /HoloScript/i },
  { path: '/learn', titleMatch: /HoloScript/i },
  { path: '/vibe', titleMatch: /HoloScript/i },
  { path: '/playground', titleMatch: /HoloScript/i },
];

test.describe('Studio Navigation Smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress onboarding modals so navigation isn't blocked
    await page.addInitScript(() => {
      localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
      localStorage.setItem('studio-wizard-seen', '1');
      localStorage.setItem('holoscript-returning-user', '1');
    });
  });

  test('root page loads for returning users', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HoloScript/i);
    // Hero CTA should be visible
    await expect(page.getByRole('link', { name: /Vibe Coding Mode/i })).toBeVisible();
  });

  // FIXME: Client-side redirect via router.replace in useEffect is flaky in
  // Playwright — the redirect sometimes doesn't fire before the test timeout.
  test.fixme('root page redirects first-time users to /start', async ({ page, context }) => {
    // Use a fresh page without returning-user localStorage
    const freshPage = await context.newPage();
    await freshPage.goto('/');
    // Client-side redirect via useEffect can take a moment after hydration
    await expect(freshPage).toHaveURL(/\/start/, { timeout: 15_000 });
    await freshPage.close();
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} loads without hard console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle');

      // Soft fail on title — some generated pages may not set it
      const title = await page.title().catch(() => '');
      if (route.titleMatch) {
        expect(title).toMatch(route.titleMatch);
      }

      const hardErrors = errors.filter(
        (e) =>
          !e.includes('WebGL') &&
          !e.includes('THREE') &&
          !e.includes('favicon') &&
          !e.includes('Failed to load resource') &&
          !e.includes('Yjs was already imported') &&
          !e.includes('WebSocket') &&
          !e.includes('webpack-hmr')
      );
      expect(hardErrors).toHaveLength(0);
    });
  }

  test('global nav links are visible on /create', async ({ page }) => {
    await page.goto('/create', { waitUntil: 'domcontentloaded' });

    // Wait for sidebar nav to mount
    const nav = page.getByRole('navigation', { name: /Main navigation/i });
    await expect(nav).toBeVisible({ timeout: 10_000 });

    const expectedLinks = ['Start', 'Vibe', 'Playground', 'Create', 'Projects', 'Avatar', 'HoloMesh', 'Teams', 'Agents', 'Absorb', 'Learn'];
    for (const label of expectedLinks) {
      const link = nav.getByRole('link', { name: new RegExp(label, 'i') }).first();
      await expect(link, `Nav link "${label}" should be visible`).toBeVisible({ timeout: 5_000 });
    }
  });

  test('can navigate from /create to /holomesh via sidebar', async ({ page }) => {
    await page.goto('/create', { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('navigation', { name: /Main navigation/i });
    const holoLink = nav.getByRole('link', { name: /HoloMesh/i }).first();
    await expect(holoLink).toBeVisible({ timeout: 10_000 });
    await holoLink.click();
    await expect(page).toHaveURL(/\/holomesh/);
  });

  test('can navigate from /create to /agents via sidebar', async ({ page }) => {
    await page.goto('/create', { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('navigation', { name: /Main navigation/i });
    const agentsLink = nav.getByRole('link', { name: /Agents/i }).first();
    await expect(agentsLink).toBeVisible({ timeout: 10_000 });
    await agentsLink.click();
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });
  });
});
