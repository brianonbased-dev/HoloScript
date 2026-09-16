import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({
  getDb: vi.fn(() => null),
}));

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}));

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from '../db/client';
import { buildAuthOptions } from './auth';

describe('auth configuration', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envSnapshot };
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    delete process.env.AUTH_GITHUB_ID;
    delete process.env.AUTH_GITHUB_SECRET;
    // Founder recognition is env-driven, so each test states its own
    // configuration and starts from nothing configured.
    delete process.env.STUDIO_FOUNDER_GITHUB_IDS;
    delete process.env.STUDIO_FOUNDER_GOOGLE_IDS;
    delete process.env.STUDIO_FOUNDER_EMAILS;
    delete process.env.STUDIO_FOUNDER_GITHUB_USERS;
  });

  it('enables the GitHub provider from production OAuth env aliases', () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'oauth-client-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'oauth-client-secret';

    const options = buildAuthOptions();

    expect(options.providers.map((provider) => provider.id)).toContain('github');
  });

  it('uses JWT sessions even when the database adapter is configured', () => {
    vi.mocked(getDb).mockReturnValue({} as ReturnType<typeof getDb>);

    const options = buildAuthOptions();

    expect(options.session?.strategy).toBe('jwt');
    expect(DrizzleAdapter).toHaveBeenCalled();
  });

  it('exposes GitHub OAuth access tokens on the session callback', async () => {
    const options = buildAuthOptions();
    const sessionCallback = options.callbacks?.session;

    expect(sessionCallback).toBeDefined();

    const session = await sessionCallback!({
      session: {
        expires: '2026-05-10T00:00:00.000Z',
        user: { id: '', name: null, email: null, image: null },
      },
      token: {
        sub: 'github-user-id',
        accessToken: 'gho_session_token',
        provider: 'github',
        githubUsername: 'octocat',
      },
      user: undefined as never,
      newSession: undefined,
      trigger: 'update',
    });

    expect(session.accessToken).toBe('gho_session_token');
    expect(session.githubConnected).toBe(true);
    expect(session.user.id).toBe('github-user-id');
    expect(session.user.githubUsername).toBe('octocat');
  });

  /**
   * The session callback is the ONE place founder authority is decided, because
   * STUDIO_FOUNDER_* is server-only env. Every test below fails if that wiring
   * is deleted — which it previously was not, so the fields could be removed
   * and the suite stayed green.
   */
  describe('identity carried onto the session', () => {
    async function runSessionCallback(token: Record<string, unknown>) {
      const sessionCallback = buildAuthOptions().callbacks?.session;
      expect(sessionCallback).toBeDefined();
      return sessionCallback!({
        session: {
          expires: '2026-05-10T00:00:00.000Z',
          user: { id: '', name: null, email: null, image: null },
        },
        token,
        user: undefined as never,
        newSession: undefined,
        trigger: 'update',
      });
    }

    it('carries the provider, its account id and the verified-email claim', async () => {
      const session = await runSessionCallback({
        sub: 'github-user-id',
        provider: 'github',
        providerAccountId: '225674784',
        emailVerified: true,
        githubUsername: 'octocat',
      });

      expect(session.user.provider).toBe('github');
      expect(session.user.providerAccountId).toBe('225674784');
      expect(session.user.emailVerified).toBe(true);
    });

    it('leaves emailVerified undefined when the token predates the claim', async () => {
      const session = await runSessionCallback({ sub: 'u', provider: 'google' });

      // Not `false`. A token minted before the field existed says nothing about
      // the address; collapsing that to a refusal signs the founder out.
      expect(session.user.emailVerified).toBeUndefined();
    });

    it('decides isFounder on the server from the GitHub numeric account id', async () => {
      process.env.STUDIO_FOUNDER_GITHUB_IDS = '225674784';

      const session = await runSessionCallback({
        sub: 'github-user-id',
        provider: 'github',
        providerAccountId: '225674784',
        name: 'Somebody Else Entirely',
      });

      expect(session.user.isFounder).toBe(true);
    });

    it('decides isFounder for a Google sign-in whose token lacks emailVerified', async () => {
      process.env.STUDIO_FOUNDER_EMAILS = 'founder@example.test';

      const session = await runSessionCallback({
        sub: 'google-user-id',
        provider: 'google',
        email: 'founder@example.test',
      });

      expect(session.user.isFounder).toBe(true);
    });

    it('says not-founder for an ordinary sign-in, and when nothing is configured', async () => {
      process.env.STUDIO_FOUNDER_GITHUB_IDS = '225674784';

      const other = await runSessionCallback({
        sub: 'u',
        provider: 'github',
        providerAccountId: '999999999',
        githubUsername: 'octocat',
      });
      expect(other.user.isFounder).toBe(false);

      delete process.env.STUDIO_FOUNDER_GITHUB_IDS;
      const unconfigured = await runSessionCallback({
        sub: 'u',
        provider: 'github',
        providerAccountId: '225674784',
      });
      expect(unconfigured.user.isFounder).toBe(false);
    });
  });
});
