/**
 * e2e/brittney-first-use.spec.ts - Creator Advocate audit 2026-10-14, item 1.
 *
 * First-use Brittney path:
 *   - home "Chat with Brittney" and /start land in /create with the chat open
 *     (they used to bounce to /);
 *   - the chat panel is usable width (reported ~4px wide);
 *   - a sent message stays on screen after the server adopts a conversation
 *     id (it used to vanish when the thread key changed mid-stream).
 *
 * Auth and /api/brittney are mocked; no OAuth and no model call.
 */
import { test, expect, type Page } from '@playwright/test';

const SESSION = {
  user: { name: 'E2E User', email: 'e2e@example.com', image: null },
  expires: '2099-01-01T00:00:00.000Z',
};

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
    localStorage.setItem('studio-wizard-seen', '1');
    localStorage.setItem('studio-mode', 'artist');
  });
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: SESSION }));
  await page.route('**/api/auth/_log', (r) => r.fulfill({ json: {} }));
}

function brittneyInput(page: Page) {
  return page.locator('textarea[placeholder*="assistant"]').first();
}

test.describe('Brittney first use', () => {
  test.describe.configure({ timeout: 180_000 });

  test('/start opens /create with the Brittney chat', async ({ page }) => {
    await setup(page);
    await page.goto('/start', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForURL(/\/create/, { timeout: 90_000 });
    await expect(brittneyInput(page)).toBeVisible({ timeout: 90_000 });
  });

  test('home "Chat with Brittney" opens the chat in /create', async ({ page }) => {
    await setup(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.getByRole('link', { name: /Chat with Brittney/ }).click();
    await page.waitForURL(/\/create/, { timeout: 90_000 });
    await expect(brittneyInput(page)).toBeVisible({ timeout: 90_000 });
  });

  test('chat panel is usable width', async ({ page }) => {
    await setup(page);
    await page.goto('/create?mode=world&chat=1', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const input = brittneyInput(page);
    await expect(input).toBeVisible({ timeout: 90_000 });
    const box = await input.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
  });

  test('a sent message stays visible when the server adopts a conversation', async ({ page }) => {
    await setup(page);
    await page.route('**/api/brittney', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const events = [
        { type: 'conversation', payload: { conversationId: 'conv-e2e-1' } },
        { type: 'text', payload: 'Here is your cube.' },
        { type: 'done', payload: null },
      ];
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
      });
    });
    await page.goto('/create?mode=world&chat=1', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const input = brittneyInput(page);
    await expect(input).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await input.fill('make a red cube please');
      await expect(input).toHaveValue('make a red cube please', { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await input.press('Enter');
    await expect(page.getByText('Here is your cube.')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await expect(page.getByText('make a red cube please')).toBeVisible();
    await expect(page.getByText('Here is your cube.')).toBeVisible();
  });
});