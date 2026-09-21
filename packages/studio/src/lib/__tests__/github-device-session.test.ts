/**
 * The device-flow cookie is a BROWSER credential, and these cases pin whose it
 * is.
 *
 * It lives 30 days at path '/', survives sign-out, and carried nothing that
 * said who linked it. Provisioning now asks GitHub who the credential belongs
 * to and mints a founder-tier key for the answer, so "whoever used this browser
 * last" had become an identity claim. Binding it to the session that obtained
 * it is what these tests hold in place.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

import {
  GITHUB_DEVICE_TOKEN_COOKIE,
  decryptGitHubDeviceTokenRecord,
  encryptGitHubDeviceToken,
  getGitHubDeviceToken,
  setGitHubDeviceTokenCookie,
} from '../github-device-session';

const OWNER = 'user-who-linked-github';
const SOMEONE_ELSE = 'user-on-the-same-browser';
const RAW_TOKEN = 'gho_device_flow_credential_1234567890';

function requestCarrying(cookieValue: string): NextRequest {
  return new NextRequest('https://studio.test/api/github/repos', {
    headers: { cookie: `${GITHUB_DEVICE_TOKEN_COOKIE}=${cookieValue}` },
  });
}

describe('github device-session cookie binding', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = 'test-auth-secret-for-device-binding';
  });

  it('stores the owner inside the encrypted payload, never in the clear', async () => {
    const encrypted = await encryptGitHubDeviceToken(RAW_TOKEN, OWNER);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain(OWNER);
    expect(encrypted).not.toContain(RAW_TOKEN);

    await expect(decryptGitHubDeviceTokenRecord(encrypted!)).resolves.toEqual({
      token: RAW_TOKEN,
      userId: OWNER,
    });
  });

  it('gives the credential back to the session that linked it', async () => {
    const encrypted = await encryptGitHubDeviceToken(RAW_TOKEN, OWNER);

    await expect(
      getGitHubDeviceToken(requestCarrying(encrypted!), { userId: OWNER })
    ).resolves.toBe(RAW_TOKEN);
  });

  it('refuses it to the next person signed in on the same browser', async () => {
    const encrypted = await encryptGitHubDeviceToken(RAW_TOKEN, OWNER);

    await expect(
      getGitHubDeviceToken(requestCarrying(encrypted!), { userId: SOMEONE_ELSE })
    ).resolves.toBeNull();
  });

  it('refuses it when nobody is signed in, even with allowUnbound', async () => {
    const encrypted = await encryptGitHubDeviceToken(RAW_TOKEN, OWNER);
    const req = requestCarrying(encrypted!);

    await expect(getGitHubDeviceToken(req, { userId: null })).resolves.toBeNull();
    // allowUnbound is about cookies that name NO owner. It must not reopen one
    // that names a different owner.
    await expect(
      getGitHubDeviceToken(req, { userId: null, allowUnbound: true })
    ).resolves.toBeNull();
  });

  describe('a cookie minted before the binding existed', () => {
    it('still works where the token is only a capability', async () => {
      const legacy = await encryptGitHubDeviceToken(RAW_TOKEN);
      await expect(decryptGitHubDeviceTokenRecord(legacy!)).resolves.toEqual({
        token: RAW_TOKEN,
        userId: null,
      });

      await expect(
        getGitHubDeviceToken(requestCarrying(legacy!), { userId: OWNER, allowUnbound: true })
      ).resolves.toBe(RAW_TOKEN);
    });

    it('is refused by default, because it cannot say who it belongs to', async () => {
      const legacy = await encryptGitHubDeviceToken(RAW_TOKEN);

      await expect(
        getGitHubDeviceToken(requestCarrying(legacy!), { userId: OWNER })
      ).resolves.toBeNull();
    });
  });

  it('refuses to mint an unowned cookie', async () => {
    const response = NextResponse.json({ ok: true });

    await expect(setGitHubDeviceTokenCookie(response, RAW_TOKEN, '')).resolves.toBe(false);
    expect(response.cookies.get(GITHUB_DEVICE_TOKEN_COOKIE)).toBeUndefined();
  });

  it('round-trips through the cookie the route actually sets', async () => {
    const response = NextResponse.json({ ok: true });
    await expect(setGitHubDeviceTokenCookie(response, RAW_TOKEN, OWNER)).resolves.toBe(true);

    const cookieValue = response.cookies.get(GITHUB_DEVICE_TOKEN_COOKIE)?.value ?? '';
    expect(cookieValue).not.toContain(RAW_TOKEN);

    await expect(
      getGitHubDeviceToken(requestCarrying(cookieValue), { userId: OWNER })
    ).resolves.toBe(RAW_TOKEN);
    await expect(
      getGitHubDeviceToken(requestCarrying(cookieValue), { userId: SOMEONE_ELSE })
    ).resolves.toBeNull();
  });

  it('returns nothing when the cookie cannot be decrypted', async () => {
    await expect(
      getGitHubDeviceToken(requestCarrying('not.a.real.cookie'), { userId: OWNER })
    ).resolves.toBeNull();
  });
});
