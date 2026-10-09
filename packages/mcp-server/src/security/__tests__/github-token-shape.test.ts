/**
 * The GitHub fallback in OAuth21Service.authenticateRequestAsync ran for ANY Bearer the other
 * strategies did not recognise, and it sent that Bearer to https://api.github.com/user. So a
 * HoloMesh agent key, a Moltbook key, or a mistyped secret presented to this server was shown to
 * GitHub. Only tokens in a shape GitHub issues are sent now; GitHub logins (gho_ from the device
 * flow and web sign-in, ghu_, PATs) keep working.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tenant lookup is the step before GitHub; with DATABASE_URL or Upstash set in the shell running
// the tests it would reach out. It answers "not a tenant" here.
vi.mock('../tenant-auth', () => ({ validateTenantKey: async () => null }));

import { isGitHubShapedToken, resolveGitHubTokenForMcp } from '../github-auth';
import { OAuth21Service, resetOAuth21Service } from '../oauth21';

const ALNUM36 = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';

let githubCalls: string[] = [];
let tokenCounter = 0;
/** A distinct token per test: the resolver caches by token. */
const fresh = (prefix: string) => `${prefix}${ALNUM36}${String(++tokenCounter).padStart(4, '0')}`;

beforeEach(() => {
  githubCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (new URL(href).hostname === 'api.github.com') {
        githubCalls.push(String((init?.headers as Record<string, string>)?.Authorization ?? ''));
        return new Response(
          JSON.stringify({ id: 4242, login: 'octo-member', name: null, avatar_url: '' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`unexpected request in test: ${href}`);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetOAuth21Service();
});

describe('isGitHubShapedToken', () => {
  it('accepts the shapes GitHub issues', () => {
    for (const prefix of ['gho_', 'ghu_', 'ghp_', 'ghs_', 'ghr_']) {
      expect(isGitHubShapedToken(`${prefix}${ALNUM36}`), prefix).toBe(true);
    }
    expect(isGitHubShapedToken(`github_pat_11ABCDEFG0_${ALNUM36}`)).toBe(true);
    expect(isGitHubShapedToken('0123456789abcdef0123456789abcdef01234567')).toBe(true);
  });

  it('refuses everything else', () => {
    for (const token of [
      `holomesh_sk_${'0123456789abcdef'.repeat(2)}`,
      `hs_${'ab'.repeat(32)}`,
      `moltbook_${ALNUM36}`,
      `0x${'0123456789abcdef'.repeat(2)}01234567`, // a wallet address, 0x + 40 hex
      '0123456789ABCDEF0123456789ABCDEF01234567', // 40 hex, upper case
      'gho_short',
      `gho_${ALNUM36}!`,
      '',
    ]) {
      expect(isGitHubShapedToken(token), token).toBe(false);
    }
  });
});

describe('resolveGitHubTokenForMcp', () => {
  it('sends nothing to GitHub for a token that is not GitHub-shaped', async () => {
    const result = await resolveGitHubTokenForMcp(`holomesh_sk_${'0123456789abcdef'.repeat(2)}`);
    expect(result).toBeNull();
    expect(githubCalls).toEqual([]);
  });

  it('still resolves a gho_ token through api.github.com/user', async () => {
    const token = fresh('gho_');
    const result = await resolveGitHubTokenForMcp(token);
    expect(githubCalls).toEqual([`token ${token}`]);
    expect(result?.active).toBe(true);
    expect(result?.agentId).toBe('github:4242');
    expect(result?.clientId).toBe('github:octo-member');
  });
});

describe('OAuth21Service.authenticateRequestAsync, the Bearer fallback', () => {
  const service = () =>
    new OAuth21Service({
      tokenSecret: 'x'.repeat(64),
      migrationMode: 'permissive',
      legacyApiKey: 'hs_legacy_key_unused_by_these_tests',
    });

  it('a HoloMesh agent key is inactive and never reaches api.github.com', async () => {
    const auth = await service().authenticateRequestAsync({
      authorization: `Bearer holomesh_sk_${'0123456789abcdef'.repeat(2)}`,
    });
    expect(auth.active).toBe(false);
    expect(githubCalls).toEqual([]);
  });

  it('a GitHub login (gho_ from the device flow or web sign-in) still authenticates', async () => {
    const token = fresh('gho_');
    const auth = await service().authenticateRequestAsync({ authorization: `Bearer ${token}` });
    expect(githubCalls).toEqual([`token ${token}`]);
    expect(auth.active).toBe(true);
    expect(auth.agentId).toBe('github:4242');
    expect(auth.scopes).toContain('tools:write');
    expect(auth.scopes).not.toContain('admin:*');
  });

  it('a GitHub App user token (ghu_) still authenticates', async () => {
    const token = fresh('ghu_');
    const auth = await service().authenticateRequestAsync({ authorization: `Bearer ${token}` });
    expect(githubCalls).toEqual([`token ${token}`]);
    expect(auth.active).toBe(true);
  });
});
