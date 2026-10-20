/**
 * e2e/money-display.spec.ts - Creator Advocate audit 2026-10-14, item 4.
 * /agents/me showed "$NaN" revenue and "undefined" sales when the earnings
 * endpoint answered with an error body or a partial payload. All HoloMesh
 * and auth calls are mocked; nothing reaches a real backend.
 */
import { test, expect, type Page } from '@playwright/test';

const SESSION = {
  user: { id: 'u-e2e', name: 'E2E User', email: 'e2e@example.com', image: null },
  expires: '2099-01-01T00:00:00.000Z',
};

async function mockMesh(page: Page, earnings: { status: number; body: unknown }) {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: SESSION }));
  await page.route('**/api/auth/_log', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/holomesh/**', (r) => {
    const url = r.request().url();
    if (url.includes('/dashboard/earnings')) {
      return r.fulfill({ status: earnings.status, json: earnings.body });
    }
    if (url.includes('/agent/self/knowledge')) return r.fulfill({ json: { entries: [] } });
    if (url.includes('/agent/self')) {
      return r.fulfill({
        json: {
          success: true,
          agent: { id: 'agent-e2e', name: 'E2E Agent', bio: '', domains: [], createdAt: '2026-10-01T00:00:00.000Z' },
          reputation: { score: 0, tier: 'newcomer', contributions: 0, queriesAnswered: 0, reuseRate: 0 },
        },
      });
    }
    if (url.includes('/dashboard')) {
      return r.fulfill({ json: { status: 'active', agentId: 'agent-e2e', stats: {} } });
    }
    return r.fulfill({ json: {} });
  });
}

const CASES: Array<[string, { status: number; body: unknown }]> = [
  ['an error body', { status: 502, body: { error: 'upstream unavailable' } }],
  ['a partial payload', { status: 200, body: { earnings: { byDomain: {} } } }],
];

test.describe('money display (audit item 4)', () => {
  test.describe.configure({ timeout: 180_000 });
  for (const [name, earnings] of CASES) {
    test(`/agents/me shows no $NaN / undefined for ${name}`, async ({ page }) => {
      await mockMesh(page, earnings);
      for (const tab of ['profile', 'dashboard']) {
        await page.goto(`/agents/me?tab=${tab}`, { waitUntil: 'load', timeout: 120_000 });
        await expect(page.getByText(/E2E Agent|Dashboard/).first()).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(2_000);
        const body = await page.locator('main, body').first().innerText();
        expect(body, `tab=${tab}`).not.toContain('$NaN');
        expect(body, `tab=${tab}`).not.toMatch(/\bundefined\b/);
        expect(body, `tab=${tab}`).not.toMatch(/\bNaN\b/);
      }
    });
  }
});