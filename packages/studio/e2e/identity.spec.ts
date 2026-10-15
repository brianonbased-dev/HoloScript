/**
 * e2e/identity.spec.ts - Creator Advocate audit 2026-10-14, item 3.
 * Signed in with GitHub (mocked): Settings > Profile must show the profile
 * form, and the navigation must offer an account menu naming the user.
 * Auth and user APIs are mocked; nothing is written anywhere.
 */
import { test, expect, type Page } from '@playwright/test';

const SESSION = {
  user: { id: 'u-e2e', name: 'Octo Cat', email: 'octo@example.com', image: null },
  expires: '2099-01-01T00:00:00.000Z',
};

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
    localStorage.setItem('studio-wizard-seen', '1');
  });
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: SESSION }));
  await page.route('**/api/auth/_log', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/users/u-e2e', (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({ json: { user: { id: 'u-e2e', name: 'Octo Cat', bio: 'hi', website: '' } } })
      : r.fulfill({ status: 405, json: {} })
  );
}

test.describe('identity (audit item 3)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('Settings > Profile shows the profile form with the GitHub name', async ({ page }) => {
    await signedIn(page);
    await page.goto('/settings?tab=profile', { waitUntil: 'load', timeout: 120_000 });
    const name = page.getByPlaceholder('Your display name');
    await expect(name).toBeVisible({ timeout: 60_000 });
    await expect(name).toHaveValue('Octo Cat');
  });

  test('navigation has an account menu naming the signed-in user', async ({ page }) => {
    await signedIn(page);
    await page.goto('/settings', { waitUntil: 'load', timeout: 120_000 });
    const menu = page.getByRole('button', { name: /Account menu/i });
    await expect(menu).toBeVisible({ timeout: 60_000 });
    await expect(menu).toContainText('Octo Cat');
    await menu.click();
    await expect(page.getByRole('menuitem', { name: /Sign out/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Profile/i })).toBeVisible();
  });

  test('/agents/me names the GitHub user, not the server agent ("Founder")', async ({ page }) => {
    await signedIn(page);
    await page.route('**/api/holomesh/**', (r) => {
      const url = r.request().url();
      if (url.includes('/agent/self/knowledge')) return r.fulfill({ json: { success: true, entries: [] } });
      if (url.includes('/agent/self')) {
        return r.fulfill({
          status: 404,
          json: { success: false, code: 'no_holomesh_agent', error: 'No HoloMesh agent is linked to your account yet.' },
        });
      }
      return r.fulfill({ status: 401, json: { error: 'unauthenticated' } });
    });
    await page.goto('/agents/me', { waitUntil: 'load', timeout: 120_000 });
    await expect(page.getByText('Signed in as Octo Cat')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Founder')).toHaveCount(0);
  });
});