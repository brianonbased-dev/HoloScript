import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encryptGitHubDeviceToken, GITHUB_DEVICE_TOKEN_COOKIE } from '@/lib/github-device-session';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mocks.getToken,
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { getGitHubAuthRequiredMessage, getGitHubToken } from './_shared';

/** The Studio user id every case below is signed in as. */
const SESSION_USER = 'user-session-1';

function githubRequest(cookie?: string): NextRequest {
  return new NextRequest(
    'https://studio.test/api/github/repos',
    cookie ? { headers: { cookie } } : undefined
  );
}

describe('getGitHubToken', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = 'test-auth-secret-for-github-token-helper';
    delete process.env.GITHUB_TOKEN;
    delete process.env.PERSONAL_ACCESS_TOKEN;
    delete process.env.PAT_TOKEN;
    delete process.env.STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK;
    delete process.env.ALLOW_SERVER_GITHUB_TOKEN_FALLBACK;
    // Signed out unless a case says otherwise. `restoreMocks` clears the
    // implementation between cases, so it is set here rather than at creation.
    mocks.getToken.mockImplementation(async () => null);
    mocks.getServerSession.mockImplementation(async () => null);
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

  it('userOnly never returns the server token, even where the fallback is allowed', async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = 'development';
    process.env.GITHUB_TOKEN = 'ghp_server_token';

    const req = new NextRequest('http://localhost/api/absorb/credits');

    // Control: the same setup without userOnly does hand out the server token.
    await expect(getGitHubToken(req)).resolves.toBe('ghp_server_token');
    await expect(getGitHubToken(req, { userOnly: true })).resolves.toBeNull();
  });

  it('userOnly still returns the signed-in user token', async () => {
    const rawToken = 'gho_device_cookie_user_only_1234567890';
    // Bound to the session reading it, which is what the linked-credential
    // path now stores. The unbound form is covered on its own below.
    const encryptedToken = await encryptGitHubDeviceToken(rawToken, SESSION_USER);
    mocks.getToken.mockImplementation(async () => ({ sub: SESSION_USER }));
    process.env.GITHUB_TOKEN = 'ghp_server_token';

    const req = new NextRequest('https://studio.test/api/workspace/provision', {
      headers: { cookie: `${GITHUB_DEVICE_TOKEN_COOKIE}=${encryptedToken}` },
    });

    await expect(getGitHubToken(req, { userOnly: true })).resolves.toBe(rawToken);
  });

  it('omits the server token hint from production auth errors by default', () => {
    process.env.NODE_ENV = 'production';

    expect(getGitHubAuthRequiredMessage()).toBe('Not authenticated. Sign in with GitHub.');
  });
});

/**
 * Whose credential goes to GitHub.
 *
 * `lib/auth.ts` writes `token.accessToken` from `account.access_token` for
 * EVERY provider, so a Google sign-in leaves a GOOGLE OAuth token in the field
 * a GitHub sign-in uses. This helper returned it, and its callers put it
 * straight into `Authorization: Bearer` against api.github.com — for the very
 * caller the linked-GitHub rescue path was written for. GitHub rejected it, so
 * the failure looked identical either way and nothing pointed at the cause.
 */
describe('getGitHubToken provider scoping', () => {
  const envSnapshot = { ...process.env };
  const GOOGLE_TOKEN = 'ya29-google-access-token-not-for-github';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = 'test-auth-secret-for-provider-scoping';
    // Production, so a server-token fallback cannot stand in for a real answer
    // and make a refusal look like a pass.
    process.env.NODE_ENV = 'production';
    delete process.env.GITHUB_TOKEN;
    delete process.env.PERSONAL_ACCESS_TOKEN;
    delete process.env.PAT_TOKEN;
    mocks.getToken.mockImplementation(async () => null);
    mocks.getServerSession.mockImplementation(async () => null);
  });

  it('never hands a Google session token to a GitHub caller', async () => {
    mocks.getToken.mockImplementation(async () => ({
      sub: SESSION_USER,
      provider: 'google',
      accessToken: GOOGLE_TOKEN,
    }));

    await expect(getGitHubToken(githubRequest())).resolves.toBeNull();
  });

  it('positive control: the same shape signed in through GitHub is returned', async () => {
    mocks.getToken.mockImplementation(async () => ({
      sub: SESSION_USER,
      provider: 'github',
      accessToken: 'gho_github_session_token',
    }));

    await expect(getGitHubToken(githubRequest())).resolves.toBe('gho_github_session_token');
  });

  it('never leaks it through the server-session branch either', async () => {
    mocks.getServerSession.mockImplementation(async () => ({
      accessToken: GOOGLE_TOKEN,
      user: { id: SESSION_USER, provider: 'google' },
    }));

    await expect(getGitHubToken(githubRequest())).resolves.toBeNull();

    mocks.getServerSession.mockImplementation(async () => ({
      accessToken: 'gho_github_server_session_token',
      user: { id: SESSION_USER, provider: 'github' },
    }));

    await expect(getGitHubToken(githubRequest())).resolves.toBe(
      'gho_github_server_session_token'
    );
  });

  it('gives the Google caller the GitHub credential they actually linked', async () => {
    const linkedToken = 'gho_linked_by_device_flow_1234567890';
    const encryptedToken = await encryptGitHubDeviceToken(linkedToken, SESSION_USER);
    mocks.getToken.mockImplementation(async () => ({
      sub: SESSION_USER,
      provider: 'google',
      accessToken: GOOGLE_TOKEN,
    }));

    const req = githubRequest(`${GITHUB_DEVICE_TOKEN_COOKIE}=${encryptedToken}`);

    // This is the whole point of the rescue path: the caller is served, and
    // served the credential that belongs to the audience it is going to.
    await expect(getGitHubToken(req, { userOnly: true })).resolves.toBe(linkedToken);
  });

  it('still serves a session minted before the provider was recorded', async () => {
    // Nothing here may lock out a token already in someone's browser. A GitHub
    // profile is the only one that carries `login`, so the login stands in for
    // an absent provider.
    mocks.getToken.mockImplementation(async () => ({
      sub: SESSION_USER,
      githubUsername: 'octocat',
      accessToken: 'gho_token_from_before_provider_existed',
    }));

    await expect(getGitHubToken(githubRequest())).resolves.toBe(
      'gho_token_from_before_provider_existed'
    );
  });

  it('is not fooled by a stale GitHub login left on a Google sign-in', async () => {
    // Signing in with Google reuses the existing token and does not clear
    // `githubUsername`, so a present provider has to win over it.
    mocks.getToken.mockImplementation(async () => ({
      sub: SESSION_USER,
      provider: 'google',
      githubUsername: 'octocat',
      accessToken: GOOGLE_TOKEN,
    }));

    await expect(getGitHubToken(githubRequest())).resolves.toBeNull();
  });

  it('refuses a linked credential to a different signed-in user', async () => {
    const linkedToken = 'gho_linked_by_someone_else_1234567890';
    const encryptedToken = await encryptGitHubDeviceToken(linkedToken, 'user-who-linked-it');
    mocks.getToken.mockImplementation(async () => ({
      sub: 'user-signed-in-on-the-same-browser',
      provider: 'google',
    }));

    const req = githubRequest(`${GITHUB_DEVICE_TOKEN_COOKIE}=${encryptedToken}`);

    await expect(getGitHubToken(req)).resolves.toBeNull();
    await expect(getGitHubToken(req, { userOnly: true })).resolves.toBeNull();
  });

  it('keeps an unowned cookie as a capability, never as an identity', async () => {
    const legacyToken = 'gho_linked_before_binding_existed_123';
    const encryptedToken = await encryptGitHubDeviceToken(legacyToken);
    mocks.getToken.mockImplementation(async () => ({ sub: SESSION_USER, provider: 'google' }));

    const req = githubRequest(`${GITHUB_DEVICE_TOKEN_COOKIE}=${encryptedToken}`);

    // Ordinary work keeps working for everyone who linked GitHub before this
    // deploy...
    await expect(getGitHubToken(req)).resolves.toBe(legacyToken);
    // ...but it cannot answer "who is this caller", which is what provisioning
    // asks before it mints a founder-tier key.
    await expect(getGitHubToken(req, { userOnly: true })).resolves.toBeNull();
  });
});
