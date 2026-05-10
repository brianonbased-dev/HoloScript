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
});
