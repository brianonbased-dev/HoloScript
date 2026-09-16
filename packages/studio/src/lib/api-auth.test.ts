import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The App Router JWT fallback in `getSession()` is a SECOND place a session is
 * built, and it has to agree with the NextAuth session callback. Before this
 * suite the identity lines in it could be deleted and the whole studio suite
 * stayed green — so the founder could have been silently dropped to a plain
 * user on every route that reaches auth through this path.
 */

const getServerSessionStub = vi.hoisted(() => vi.fn());
const getTokenStub = vi.hoisted(() => vi.fn());
const cookiesStub = vi.hoisted(() => vi.fn());

vi.mock('next-auth', () => ({ getServerSession: getServerSessionStub }));
vi.mock('next-auth/jwt', () => ({ getToken: getTokenStub }));
vi.mock('next/headers', () => ({ cookies: cookiesStub }));
vi.mock('./auth', () => ({ authOptions: {} }));
vi.mock('../db/client', () => ({ getDb: vi.fn(() => null) }));
vi.mock('../db/schema', () => ({ users: {} }));

import { NextResponse } from 'next/server';
import { getSession, requireFounder } from './api-auth';

const FOUNDER_GITHUB_ID = '225674784';
const FOUNDER_EMAIL = 'founder@example.test';

/** A JWT as NextAuth hands it to us, with whatever claims that token carries. */
function tokenIs(claims: Record<string, unknown>): void {
  getServerSessionStub.mockResolvedValue(null); // force the fallback path
  getTokenStub.mockResolvedValue(claims);
}

describe('getSession JWT fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', FOUNDER_GITHUB_ID);
    vi.stubEnv('STUDIO_FOUNDER_EMAILS', FOUNDER_EMAIL);
    cookiesStub.mockResolvedValue({ getAll: () => [{ name: 'next-auth.session-token', value: 'x' }] });
  });

  it('carries the provider, its account id and the verified-email claim', async () => {
    tokenIs({
      sub: 'user-1',
      provider: 'github',
      providerAccountId: FOUNDER_GITHUB_ID,
      emailVerified: true,
      githubUsername: 'octocat',
    });

    const session = await getSession();

    expect(session?.user.provider).toBe('github');
    expect(session?.user.providerAccountId).toBe(FOUNDER_GITHUB_ID);
    expect(session?.user.emailVerified).toBe(true);
    expect(session?.user.githubUsername).toBe('octocat');
  });

  it('leaves emailVerified undefined when the token predates the claim', async () => {
    tokenIs({ sub: 'user-1', provider: 'google', email: FOUNDER_EMAIL });

    const session = await getSession();

    // Not `false` — see the already-issued-token window in workspaceIdentity.ts.
    expect(session?.user.emailVerified).toBeUndefined();
  });

  it('decides isFounder on the server, matching the session callback', async () => {
    tokenIs({
      sub: 'user-1',
      provider: 'github',
      providerAccountId: FOUNDER_GITHUB_ID,
      name: 'Somebody Else Entirely',
    });

    expect((await getSession())?.user.isFounder).toBe(true);
  });

  it('recognises the founder on a Google token that never carried emailVerified', async () => {
    tokenIs({ sub: 'user-1', provider: 'google', email: FOUNDER_EMAIL });

    expect((await getSession())?.user.isFounder).toBe(true);
  });

  it('says not-founder for an ordinary session', async () => {
    tokenIs({
      sub: 'user-2',
      provider: 'github',
      providerAccountId: '999999999',
      githubUsername: 'octocat',
    });

    expect((await getSession())?.user.isFounder).toBe(false);
  });
});

describe('requireFounder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', FOUNDER_GITHUB_ID);
    cookiesStub.mockResolvedValue({ getAll: () => [{ name: 'next-auth.session-token', value: 'x' }] });
  });

  it('lets the founder through on the account id alone', async () => {
    tokenIs({ sub: 'user-1', provider: 'github', providerAccountId: FOUNDER_GITHUB_ID });

    const result = await requireFounder();

    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('refuses an ordinary session with 403', async () => {
    tokenIs({ sub: 'user-2', provider: 'github', providerAccountId: '999999999' });

    const result = await requireFounder();

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it('refuses everyone when no founder is configured', async () => {
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', '');
    tokenIs({ sub: 'user-1', provider: 'github', providerAccountId: FOUNDER_GITHUB_ID });

    const result = await requireFounder();

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });
});
