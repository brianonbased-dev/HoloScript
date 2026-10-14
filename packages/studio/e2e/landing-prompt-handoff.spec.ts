/**
 * e2e/landing-prompt-handoff.spec.ts - P1-1 (outside audit 2026-10-14)
 *
 * The home page saves the user's prompt and sends them to /create. /create must
 * hand that prompt to the Brittney chat: the dock opens and the chat input is
 * prefilled. Covers both entry paths:
 *   1. signed in: prompt arrives via sessionStorage 'studio.landing.prompt';
 *   2. signed out: home -> sign-in -> callbackUrl /create?mode=..&prompt=..
 *
 * Auth is mocked at the network layer (/api/auth/*); no real OAuth, no real
 * LLM call (the prompt is prefilled, never auto-sent).
 */
import { test, expect, type Page } from '@playwright/test';

const PROMPT = 'a floating crystal island with a waterfall';
const SESSION = {
  user: { name: 'E2E User', email: 'e2e@example.com', image: null },
  expires: '2099-01-01T00:00:00.000Z',
};

async function suppressOnboarding(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
    localStorage.setItem('studio-wizard-seen', '1');
    localStorage.setItem('studio-mode', 'artist');
  });
}

async function mockAuth(page: Page, isSignedIn: () => boolean) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: isSignedIn() ? SESSION : {} })
  );
  await page.route('**/api/auth/_log', (route) => route.fulfill({ json: {} }));
}

function brittneyInput(page: Page) {
  // The Brittney textarea's placeholder always mentions "assistant".
  return page.locator('textarea[placeholder*="assistant"]').first();
}

test.describe('landing prompt -> Brittney chat handoff', () => {
  test.describe.configure({ timeout: 180_000 });

  test('signed in: sessionStorage prompt opens the dock and prefills the chat', async ({ page }) => {
    await suppressOnboarding(page);
    await mockAuth(page, () => true);
    await page.addInitScript((p) => {
      if (location.pathname === '/create') sessionStorage.setItem('studio.landing.prompt', p);
    }, PROMPT);

    await page.goto('/create?mode=world', { waitUntil: 'domcontentloaded', timeout: 90_000 });

    await expect(brittneyInput(page)).toBeVisible({ timeout: 90_000 });
    await expect(brittneyInput(page)).toHaveValue(PROMPT);
    // handed over once: the seed is consumed
    expect(await page.evaluate(() => sessionStorage.getItem('studio.landing.prompt'))).toBeNull();
  });

  test('signed out: home -> sign-in redirect carries the prompt into the chat', async ({ page }) => {
    let signedIn = false;
    let capturedCallback = '';
    await suppressOnboarding(page);
    await mockAuth(page, () => signedIn);
    await page.route('**/api/auth/providers', (route) =>
      route.fulfill({
        json: {
          github: {
            id: 'github',
            name: 'GitHub',
            type: 'oauth',
            signinUrl: '/api/auth/signin/github',
            callbackUrl: '/api/auth/callback/github',
          },
        },
      })
    );
    await page.route('**/api/auth/csrf', (route) => route.fulfill({ json: { csrfToken: 'e2e-csrf' } }));
    // Stand-in for the OAuth round-trip: record the callbackUrl the home page
    // asked for, mark the user signed in, and send the browser straight there.
    await page.route('**/api/auth/signin/github**', async (route) => {
      const body = new URLSearchParams(route.request().postData() ?? '');
      capturedCallback = body.get('callbackUrl') ?? '';
      signedIn = true;
      await route.fulfill({ json: { url: new URL(capturedCallback, page.url()).toString() } });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const hero = page.locator('textarea').first();
    await expect(hero).toBeVisible({ timeout: 60_000 });
    // The dev server can paint the textarea before React hydrates; a fill that
    // lands pre-hydration is dropped, so retry until the Send button enables.
    const send = page.getByRole('button', { name: 'Send prompt' });
    await expect(async () => {
      await hero.fill(PROMPT);
      await expect(send).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await hero.press('Enter');

    await page.waitForURL(/\/create\?/, { timeout: 90_000 });
    expect(capturedCallback).toContain('/create?mode=');
    expect(new URL(capturedCallback, 'http://x').searchParams.get('prompt')).toBe(PROMPT);

    await expect(brittneyInput(page)).toBeVisible({ timeout: 90_000 });
    await expect(brittneyInput(page)).toHaveValue(PROMPT);
  });
});
