import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encryptGitHubDeviceToken, GITHUB_DEVICE_TOKEN_COOKIE } from '@/lib/github-device-session';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => null),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { getGitHubToken } from './_shared';

describe('getGitHubToken', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = 'test-auth-secret-for-github-token-helper';
    delete process.env.GITHUB_TOKEN;
    delete process.env.STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK;
    delete process.env.ALLOW_SERVER_GITHUB_TOKEN_FALLBACK;
  });

  it('decrypts the device-flow cookie server-side', async () => {
    const rawToken = 'gho_device_cookie_secret_1234567890';
    const encryptedToken = await encryptGitHubDeviceToken(rawToken);
    expect(encryptedToken).toBeTruthy();

    const req = new NextRequest('http://localhost/api/github/repos', {
      headers: {
        cookie: `${GITHUB_DEVICE_TOKEN_COOKIE}=${encryptedToken}`,
      },
    });

    await expect(getGitHubToken(req)).resolves.toBe(rawToken);
  });

  it('does not use the server GitHub token fallback in production by default', async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.GITHUB_TOKEN = 'ghp_server_token';

    const req = new NextRequest('http://localhost/api/github/repos');

    await expect(getGitHubToken(req)).resolves.toBeNull();
  });

  it('allows the server GitHub token fallback in production when explicitly enabled', async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.GITHUB_TOKEN = 'ghp_server_token';
    process.env.STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK = 'true';

    const req = new NextRequest('http://localhost/api/github/repos');

    await expect(getGitHubToken(req)).resolves.toBe('ghp_server_token');
  });
});
