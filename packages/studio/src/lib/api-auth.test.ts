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
const getDbStub = vi.hoisted(() => vi.fn(() => null as unknown));
const validateApiKeyStub = vi.hoisted(() => vi.fn());

vi.mock('next-auth', () => ({ getServerSession: getServerSessionStub }));
vi.mock('next-auth/jwt', () => ({ getToken: getTokenStub }));
vi.mock('next/headers', () => ({ cookies: cookiesStub }));
vi.mock('./auth', () => ({ authOptions: {} }));
vi.mock('../db/client', () => ({ getDb: getDbStub }));
vi.mock('../db/schema', () => ({ users: { id: 'users.id' } }));
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }));
vi.mock('./brittney/userApiKeys', () => ({ validateApiKey: validateApiKeyStub }));

import { NextResponse } from 'next/server';
import { getSession, requireAuthOrApiKey, requireFounder } from './api-auth';
import { isFounderWorkspaceIdentity } from './workspace/workspaceIdentity';

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

/**
 * The API-key door into Brittney.
 *
 * `requireAuthOrApiKey` builds a SYNTHETIC session for a `bk_` bearer caller
 * out of that key's database row. Four literals in it — an empty provider, an
 * empty provider account id, `emailVerified: false` and `isFounder: false` —
 * are the only thing between a key holder and founder authority, because
 * `/api/brittney` feeds this very object to `isFounderWorkspaceIdentity` and
 * turns the answer into `allowFounderWorkspace`: the GOLD founder key on
 * knowledge reads, the founder-reserved tool gate, and whether premium rows are
 * cut. Until now nothing exercised this function at all, so all four could be
 * deleted and every suite stayed green.
 */
interface UserQuery {
  select: () => UserQuery;
  from: () => UserQuery;
  where: () => UserQuery;
  limit: () => Promise<Array<Record<string, unknown>>>;
}

/** A database whose user lookup answers with exactly these rows. */
function databaseReturning(rows: Array<Record<string, unknown>>): UserQuery {
  const query: UserQuery = {
    select: () => query,
    from: () => query,
    where: () => query,
    limit: async () => rows,
  };
  return query;
}

function keyRequest(): Request {
  return new Request('https://studio.test/api/brittney', {
    method: 'POST',
    headers: { authorization: 'Bearer bk_not_a_real_key' },
  });
}

describe('requireAuthOrApiKey', () => {
  const FOUNDER_LOGIN = 'brianonbased-dev';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', '');
    // Every identifier the founder rule is allowed to match on is configured,
    // so a refusal here cannot be an accident of nothing being set.
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', FOUNDER_GITHUB_ID);
    vi.stubEnv('STUDIO_FOUNDER_EMAILS', FOUNDER_EMAIL);
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', FOUNDER_LOGIN);
    getDbStub.mockReturnValue(null);
    getServerSessionStub.mockResolvedValue(null);
    getTokenStub.mockResolvedValue(null);
    cookiesStub.mockResolvedValue({ getAll: () => [] });
  });

  it('never treats an API key as the founder, even on the founder email', async () => {
    validateApiKeyStub.mockResolvedValue({ userId: 'user-9', keyId: 'key-9' });
    getDbStub.mockReturnValue(
      databaseReturning([
        { id: 'user-9', name: FOUNDER_LOGIN, email: FOUNDER_EMAIL, image: null },
      ])
    );

    const auth = await requireAuthOrApiKey(keyRequest());
    if (auth instanceof NextResponse) throw new Error('expected an authenticated caller');
    const { user } = auth;

    expect(user.id).toBe('user-9');
    expect(user.isFounder).toBe(false);
    // The answer the live Brittney route actually asks for.
    expect(isFounderWorkspaceIdentity(user)).toBe(false);
  });

  it('carries an identity that no founder branch can match', async () => {
    validateApiKeyStub.mockResolvedValue({ userId: 'user-9', keyId: 'key-9' });
    getDbStub.mockReturnValue(
      databaseReturning([{ id: 'user-9', name: FOUNDER_LOGIN, email: FOUNDER_EMAIL, image: null }])
    );

    const auth = await requireAuthOrApiKey(keyRequest());
    if (auth instanceof NextResponse) throw new Error('expected an authenticated caller');
    const { user } = auth;

    // A bearer token is not a sign-in. No provider, so neither the GitHub-login
    // branch nor the Google-email branch can be reached; no provider account
    // id, so the strongest branch has nothing to compare. `false` on the email
    // claim is an explicit refusal — an ABSENT claim would be read as "unknown"
    // and would satisfy the Google branch.
    expect(user.provider).toBe('');
    expect(user.providerAccountId).toBe('');
    expect(user.emailVerified).toBe(false);
    expect(user.githubUsername).toBe('');
  });

  it('refuses an invalid or revoked key', async () => {
    validateApiKeyStub.mockResolvedValue(null);

    const auth = await requireAuthOrApiKey(keyRequest());

    expect(auth).toBeInstanceOf(NextResponse);
    expect((auth as NextResponse).status).toBe(401);
  });

  it('refuses a valid key when the user database is unavailable', async () => {
    validateApiKeyStub.mockResolvedValue({ userId: 'user-9', keyId: 'key-9' });
    getDbStub.mockReturnValue(null);

    const auth = await requireAuthOrApiKey(keyRequest());

    expect(auth).toBeInstanceOf(NextResponse);
    expect((auth as NextResponse).status).toBe(503);
  });

  it('refuses a key whose user row no longer exists', async () => {
    validateApiKeyStub.mockResolvedValue({ userId: 'user-9', keyId: 'key-9' });
    getDbStub.mockReturnValue(databaseReturning([]));

    const auth = await requireAuthOrApiKey(keyRequest());

    expect(auth).toBeInstanceOf(NextResponse);
    expect((auth as NextResponse).status).toBe(401);
  });

  it('still lets the founder through on his own session, with no key', async () => {
    getTokenStub.mockResolvedValue({
      sub: 'user-1',
      provider: 'github',
      providerAccountId: FOUNDER_GITHUB_ID,
    });
    cookiesStub.mockResolvedValue({
      getAll: () => [{ name: 'next-auth.session-token', value: 'x' }],
    });

    const auth = await requireAuthOrApiKey(new Request('https://studio.test/api/brittney'));
    if (auth instanceof NextResponse) throw new Error('expected an authenticated caller');

    expect(auth.user.isFounder).toBe(true);
    expect(validateApiKeyStub).not.toHaveBeenCalled();
  });
});
