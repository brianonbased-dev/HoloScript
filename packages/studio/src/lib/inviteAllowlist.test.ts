/**
 * Invite-only sign-in (P0, 2026-10-05). Rule: lib/inviteAllowlist.ts.
 *
 * Negative controls were run against each guard (remove it, see RED, restore,
 * see GREEN). The PR description lists them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({
  getDb: vi.fn(() => null),
}));

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}));

import type { Account, Profile } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { buildAuthOptions } from './auth';
import {
  INVITE_ALLOWLIST_UNCONFIGURED_MESSAGE,
  INVITE_ONLY_PATH,
  INVITE_ONLY_SESSION_ERROR,
  evaluateInviteAllowlist,
  resetInviteAllowlistLogThrottleForTests,
} from './inviteAllowlist';

const FOUNDER_ID = '1001';
const FOUNDER_LOGIN = 'founder-login';
const ADMIN_LOGIN = 'admin-login';
const STRANGER_ID = '9009';

function configureProdLike(): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', FOUNDER_ID);
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', FOUNDER_LOGIN);
  vi.stubEnv('ADMIN_GITHUB_USERNAMES', `${FOUNDER_LOGIN}, ${ADMIN_LOGIN}`);
}

function clearAllowlist(): void {
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', '');
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', '');
  vi.stubEnv('ADMIN_GITHUB_USERNAMES', '');
}

function githubAccount(id: string): Account {
  return { provider: 'github', type: 'oauth', providerAccountId: id, access_token: 'gho_x' };
}

function githubProfile(id: string | number, login: string): Profile {
  return { id, login } as unknown as Profile;
}

async function runSignIn(account: Account | null, profile?: Profile) {
  const signIn = buildAuthOptions().callbacks?.signIn;
  expect(signIn).toBeDefined();
  return signIn!({ user: { id: 'u' }, account, profile } as Parameters<typeof signIn>[0]);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  clearAllowlist();
  resetInviteAllowlistLogThrottleForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('signIn callback: who may sign in', () => {
  beforeEach(configureProdLike);

  it('lets the founder in by numeric GitHub id, even under an unlisted login', async () => {
    expect(await runSignIn(githubAccount(FOUNDER_ID), githubProfile(1001, 'renamed-founder'))).toBe(
      true
    );
  });

  it('matches the numeric id from profile.id when the account carries none', async () => {
    const account = { provider: 'github', type: 'oauth' } as unknown as Account;
    expect(await runSignIn(account, githubProfile(1001, 'whoever'))).toBe(true);
  });

  it('lets an admin in by GitHub login (ADMIN_GITHUB_USERNAMES)', async () => {
    expect(await runSignIn(githubAccount('2002'), githubProfile(2002, 'Admin-Login'))).toBe(true);
  });

  it('refuses a GitHub user on no list and sends them to the invite-only page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await runSignIn(githubAccount(STRANGER_ID), githubProfile(9009, 'stranger'))).toBe(
      INVITE_ONLY_PATH
    );
    expect(warn).toHaveBeenCalled();
  });

  it('MISMATCH: refuses the founder login when its id is not a listed founder id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // FOUNDER_LOGIN is also in ADMIN_GITHUB_USERNAMES here; the mismatch still wins.
    expect(await runSignIn(githubAccount(STRANGER_ID), githubProfile(9009, FOUNDER_LOGIN))).toBe(
      INVITE_ONLY_PATH
    );
  });

  it('MISMATCH: allows the founder login on login alone when no founder id is listed', async () => {
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', '');
    expect(await runSignIn(githubAccount(STRANGER_ID), githubProfile(9009, FOUNDER_LOGIN))).toBe(
      true
    );
  });

  it('refuses a non-GitHub provider in production, even with an allowlisted id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const google: Account = { provider: 'google', type: 'oauth', providerAccountId: FOUNDER_ID };
    expect(await runSignIn(google, { login: FOUNDER_LOGIN } as unknown as Profile)).toBe(
      INVITE_ONLY_PATH
    );
    const creds: Account = { provider: 'credentials', type: 'credentials', providerAccountId: '1' };
    expect(await runSignIn(creds)).toBe(INVITE_ONLY_PATH);
  });

  it('FAIL CLOSED: with every list empty, nobody gets in, and it says so loudly', async () => {
    clearAllowlist();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await runSignIn(githubAccount(FOUNDER_ID), githubProfile(1001, FOUNDER_LOGIN))).toBe(
      INVITE_ONLY_PATH
    );
    expect(await runSignIn(githubAccount('2002'), githubProfile(2002, ADMIN_LOGIN))).toBe(
      INVITE_ONLY_PATH
    );
    expect(error).toHaveBeenCalledWith(INVITE_ALLOWLIST_UNCONFIGURED_MESSAGE);
  });

  it('FAIL CLOSED: unset (not just empty) lists also refuse everyone', async () => {
    delete process.env.STUDIO_FOUNDER_GITHUB_IDS;
    delete process.env.STUDIO_FOUNDER_GITHUB_USERS;
    delete process.env.ADMIN_GITHUB_USERNAMES;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(evaluateInviteAllowlist({ provider: 'github', providerAccountId: FOUNDER_ID })).toEqual({
      allowed: false,
      reason: 'unconfigured',
    });
  });
});

describe('Dev Login in local development', () => {
  it('still works with NODE_ENV=development and no allowlist configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const creds: Account = {
      provider: 'credentials',
      type: 'credentials',
      providerAccountId: 'dev-user-1',
    };
    expect(await runSignIn(creds)).toBe(true);
  });

  it('is not a back door outside development', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    configureProdLike();
    vi.stubEnv('NODE_ENV', 'test');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const creds: Account = { provider: 'credentials', type: 'credentials', providerAccountId: '1' };
    expect(await runSignIn(creds)).toBe(INVITE_ONLY_PATH);
  });
});

/**
 * Sessions are JWTs (30-day rolling maxAge), so an allowlist that ran only at
 * sign-in would leave every already-issued token valid. The jwt callback runs
 * on every session read, re-checks the rule, and flags the token. The session
 * callback then throws, and NextAuth turns that into "no session" and clears
 * the cookie (next-auth 4.24.15 core/routes/session.js try/catch).
 */
describe('existing sessions lose access on their next request', () => {
  beforeEach(configureProdLike);

  async function refresh(token: JWT): Promise<JWT> {
    const jwt = buildAuthOptions().callbacks?.jwt;
    expect(jwt).toBeDefined();
    // Every request after sign-in arrives with `account` null.
    return jwt!({ token, account: null, user: undefined as never, trigger: 'update' });
  }

  async function toSession(token: JWT) {
    const session = buildAuthOptions().callbacks?.session;
    expect(session).toBeDefined();
    return session!({
      session: { expires: '2026-11-01T00:00:00.000Z', user: { id: '' } },
      token,
      user: undefined as never,
      newSession: undefined,
      trigger: 'update',
    });
  }

  it('signs out an already-issued token for a non-allowlisted user', async () => {
    const token = await refresh({
      sub: 'other-user',
      provider: 'github',
      providerAccountId: STRANGER_ID,
      githubUsername: 'stranger',
      accessToken: 'gho_old',
    });
    expect(token.inviteDenied).toBe(true);
    await expect(toSession(token)).rejects.toThrow(INVITE_ONLY_SESSION_ERROR);
  });

  it('keeps the founder signed in, and an admin', async () => {
    const founder = await refresh({
      sub: 'founder-user',
      provider: 'github',
      providerAccountId: FOUNDER_ID,
      githubUsername: FOUNDER_LOGIN,
    });
    expect(founder.inviteDenied).toBeUndefined();
    expect((await toSession(founder)).user.isFounder).toBe(true);

    const admin = await refresh({
      sub: 'admin-user',
      provider: 'github',
      providerAccountId: '2002',
      githubUsername: ADMIN_LOGIN,
    });
    expect(admin.inviteDenied).toBeUndefined();
    expect((await toSession(admin)).user.id).toBe('admin-user');
  });

  it('keeps a legacy founder token with no numeric id, through the founder login', async () => {
    const legacy = await refresh({ sub: 'f', provider: 'github', githubUsername: FOUNDER_LOGIN });
    expect(legacy.inviteDenied).toBeUndefined();
  });

  it('clears the flag again if the user is later added to the allowlist', async () => {
    const flagged = await refresh({
      sub: 's',
      provider: 'github',
      providerAccountId: STRANGER_ID,
      githubUsername: 'stranger',
    });
    expect(flagged.inviteDenied).toBe(true);
    vi.stubEnv('ADMIN_GITHUB_USERNAMES', 'stranger');
    expect((await refresh(flagged)).inviteDenied).toBeUndefined();
  });

  it('signs out everyone, founder included, when the allowlist is emptied', async () => {
    clearAllowlist();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const founder = await refresh({
      sub: 'founder-user',
      provider: 'github',
      providerAccountId: FOUNDER_ID,
      githubUsername: FOUNDER_LOGIN,
    });
    expect(founder.inviteDenied).toBe(true);
  });
});
