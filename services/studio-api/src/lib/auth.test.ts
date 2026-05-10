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

describe('studio-api auth configuration', () => {
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

  it('surfaces the GitHub access token on the session callback', async () => {
    const options = buildAuthOptions();
    const jwt = await options.callbacks?.jwt?.({
      token: {},
      account: { provider: 'github', access_token: 'gho_session_token' },
      profile: { login: 'octocat' },
    } as never);
    const session = await options.callbacks?.session?.({
      session: {
        user: { id: '', name: null, email: 'octocat@example.com', image: null },
        expires: new Date(Date.now() + 1000).toISOString(),
      },
      token: jwt,
      user: null,
    } as never);

    expect(session?.accessToken).toBe('gho_session_token');
    expect(session?.githubConnected).toBe(true);
    expect(session?.user.githubUsername).toBe('octocat');
  });
});
