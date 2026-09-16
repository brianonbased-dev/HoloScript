import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({
  getDb: vi.fn(() => null),
}));

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}));

import type { Account, Profile } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from '../db/client';
import { buildAuthOptions } from './auth';

/** The founder's real GitHub numeric account id — the durable identifier. */
const FOUNDER_GITHUB_ID = '225674784';

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
    // The adapter is lazy now (auth.ts:100): the Proxy constructs it on first
    // property access, so read one before asserting it was wired. Without this
    // read the assertion silently stops proving anything — it passed against the
    // old eager call and failed against the lazy one, which is why this looked
    // like a flake rather than the contract change it is.
    void options.adapter?.createUser;
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

  /**
   * The jwt callback is the ONLY writer of the identity the session callback
   * above can carry across. Nothing exercised it: `token.providerAccountId =
   * account.providerAccountId` could be deleted, and
   * `token.emailVerified = providerAssertsVerifiedEmail(profile)` replaced with
   * a bare `true`, and this suite stayed green both times.
   *
   * That first line is the sole supply for `STUDIO_FOUNDER_GITHUB_IDS` — the
   * identifier the founder rollout adopts permanently. If it ever yields
   * undefined, the numeric-id branch silently never matches: the operator sees
   * the login variable work, then the re-sign-in step quietly un-founders him,
   * and every test still passes. That is the silent refusal, aimed at the
   * founder.
   */
  describe('identity written onto the token at sign-in', () => {
    function githubAccount(): Account {
      return {
        provider: 'github',
        type: 'oauth',
        providerAccountId: FOUNDER_GITHUB_ID,
        access_token: 'gho_sign_in_token',
      };
    }

    /** `login` and `email_verified` are real claims, but not on NextAuth's Profile. */
    function profileWith(claims: Record<string, unknown>): Profile {
      return claims as unknown as Profile;
    }

    async function runJwtCallback(
      account: Account | null,
      profile?: Profile,
      token: JWT = { sub: 'github-user-id' }
    ): Promise<JWT> {
      const jwtCallback = buildAuthOptions().callbacks?.jwt;
      expect(jwtCallback).toBeDefined();
      return jwtCallback!({
        token,
        account,
        profile,
        user: undefined as never,
        trigger: 'signIn',
      });
    }

    it('records the provider, its immutable account id and the GitHub login', async () => {
      const token = await runJwtCallback(githubAccount(), profileWith({ login: 'octocat' }));

      expect(token.provider).toBe('github');
      expect(token.providerAccountId).toBe(FOUNDER_GITHUB_ID);
      expect(token.githubUsername).toBe('octocat');
      expect(token.accessToken).toBe('gho_sign_in_token');
    });

    it('records the verified-email claim when the provider actually sent one', async () => {
      const token = await runJwtCallback(
        { provider: 'google', type: 'oauth', providerAccountId: 'google-sub-1' },
        profileWith({ email_verified: true })
      );

      expect(token.emailVerified).toBe(true);
    });

    it('records emailVerified false when the provider asserted nothing', async () => {
      // GitHub sends no `email_verified` claim at all, and a GitHub profile
      // email can be an unverified public address. Hardcoding `true` here would
      // let any provider's unverified address satisfy the email branch — and
      // that mutation used to leave the suite green.
      const token = await runJwtCallback(githubAccount(), profileWith({ login: 'octocat' }));

      expect(token.emailVerified).toBe(false);
    });

    it('leaves an already-issued token alone when the request carries no account', async () => {
      // Every request after sign-in arrives with `account` null. The token must
      // keep what sign-in wrote rather than being blanked on each refresh.
      const token = await runJwtCallback(null, undefined, {
        sub: 'github-user-id',
        provider: 'github',
        providerAccountId: FOUNDER_GITHUB_ID,
      });

      expect(token.provider).toBe('github');
      expect(token.providerAccountId).toBe(FOUNDER_GITHUB_ID);
    });

    it('carries the founder end to end: sign-in account → token → session', async () => {
      process.env.STUDIO_FOUNDER_GITHUB_IDS = FOUNDER_GITHUB_ID;

      // The real sequence, with nothing hand-built in between: the jwt callback
      // writes the token and the session callback reads it. A break in EITHER
      // fails this test, which is what makes it the guard on the rollout.
      const token = await runJwtCallback(githubAccount(), profileWith({ login: 'octocat' }));
      const sessionCallback = buildAuthOptions().callbacks?.session;
      expect(sessionCallback).toBeDefined();

      const session = await sessionCallback!({
        session: {
          expires: '2026-05-10T00:00:00.000Z',
          // The display name is the forgeable field, and it is somebody else's.
          user: { id: '', name: 'Somebody Else Entirely', email: null, image: null },
        },
        token,
        user: undefined as never,
        newSession: undefined,
        trigger: 'update',
      });

      expect(session.user.providerAccountId).toBe(FOUNDER_GITHUB_ID);
      expect(session.user.isFounder).toBe(true);
    });
  });
});
