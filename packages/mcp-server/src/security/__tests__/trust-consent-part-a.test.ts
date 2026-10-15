/**
 * Trust & Consent part A (oauth-and-identity-review-20261015.md), unit seats.
 *   R1/a client_credentials: never user:private; self-registered capped to public+social.
 *   R2/b the human is bound to code, access and refresh token; one grant per
 *        (user, client), 90-day max, 30-day idle, revocable; CSRF token.
 *   R3/c user:private gates earnings/credits/memory; handlers bind to the
 *        token's user; holomesh_wallet_status is admin-only.
 *   R4/d client revoke kills tokens, refresh chains, codes and grants in memory
 *        and in the durable store; who may delete.
 * Route-level seats (register defaults, authorize 401/403, DELETE 204, token
 * invalid_client) are in src/__tests__/oauth-trust-consent-routes.test.ts.
 */
import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRANT_IDLE_MS,
  GRANT_MAX_AGE_MS,
  getOAuth21Service,
  resetOAuth21Service,
} from '../oauth21';
import {
  CLIENT_CREDENTIALS_MAX_SCOPES,
  OAuth2Provider,
  USER_BOUND_SCOPES,
  consentFreeScopes,
  getInvalidPublicOAuthScopes,
} from '../../auth/oauth2-provider';
import { InMemoryTokenStore, TokenStore } from '../../auth/token-store';
import {
  USER_PRIVATE_TOOLS,
  authorizeToolCall,
  bindUserPrivateArgs,
  resolveRequiredScopes,
} from '../tool-scopes';
import { issueOAuthCsrfToken, verifyOAuthCsrfToken, OAUTH_CSRF_TTL_S } from '../oauth-csrf';
import {
  clientDeletionActor,
  defaultRegistrationGrantTypes,
  parseBasicClientCredentials,
} from '../oauth-client-deletion';
import { handleEconomyTool } from '../../economy-tools';

const REDIRECT = 'https://client.test/cb';
const VERIFIER = 'v'.repeat(64);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function svc() {
  return getOAuth21Service({ legacyApiKey: '', migrationMode: 'strict' });
}

function selfRegistered(scopes = ['social', 'tools:read', 'user:private']) {
  return svc().registerClient({
    clientName: 'trust-a',
    redirectUris: [REDIRECT],
    scopes,
    clientType: 'confidential',
    selfRegistered: true,
  });
}

function provisioned(scopes = ['tools:read', 'user:private']) {
  return svc().registerClient({
    clientName: 'trust-a-provisioned',
    redirectUris: [REDIRECT],
    scopes,
    clientType: 'confidential',
  });
}

function codeFor(clientId: string, userId = 'alice', scopes = ['user:private', 'tools:read']) {
  return svc().createAuthorizationCode({
    clientId,
    redirectUri: REDIRECT,
    scopes,
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    consent: { userId, grantId: `gid-${userId}`, scopes },
  });
}

function exchange(clientId: string, clientSecret: string, code: string) {
  return svc().exchangeAuthorizationCode({
    code,
    clientId,
    clientSecret,
    redirectUri: REDIRECT,
    codeVerifier: VERIFIER,
  });
}

beforeEach(() => resetOAuth21Service());
afterEach(() => {
  vi.useRealTimers();
  resetOAuth21Service();
});

// ── R1 / (a) ────────────────────────────────────────────────────────────────
describe('R1 default grant types at registration', () => {
  it('a remote registrant gets no client_credentials by default', () => {
    expect(
      defaultRegistrationGrantTypes({ clientType: 'confidential', registrarIsLoopback: false, remoteRegistrationAllowed: true })
    ).toEqual(['authorization_code', 'refresh_token']);
  });
  it('a loopback peer on a remote-open server counts as remote (proxy)', () => {
    expect(
      defaultRegistrationGrantTypes({ clientType: 'confidential', registrarIsLoopback: true, remoteRegistrationAllowed: true })
    ).not.toContain('client_credentials');
  });
  it('negative control: loopback-only server, loopback confidential registrant keeps cc', () => {
    expect(
      defaultRegistrationGrantTypes({ clientType: 'confidential', registrarIsLoopback: true, remoteRegistrationAllowed: false })
    ).toContain('client_credentials');
  });
  it('a client registered without cc is refused on the cc grant', () => {
    const { clientId, clientSecret } = svc().registerClient({
      clientName: 'no-cc',
      redirectUris: [REDIRECT],
      scopes: ['social'],
      clientType: 'confidential',
      selfRegistered: true,
      noClientCredentials: true,
    });
    expect(() =>
      svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['social'] })
    ).toThrow(/unauthorized_client/);
  });
});

describe('R1/a client_credentials never carries user:private', () => {
  it('refuses user:private on client_credentials (self-registered client)', () => {
    const { clientId, clientSecret } = selfRegistered();
    expect(() =>
      svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['user:private'] })
    ).toThrow(/user:private is issued only through authorization_code/);
  });

  it('refuses user:private on client_credentials (pre-provisioned client too)', () => {
    const { clientId, clientSecret } = provisioned();
    expect(() =>
      svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['user:private'] })
    ).toThrow(/invalid_scope/);
  });

  it('a pre-provisioned client defaulting to its own scopes does not inherit user:private', () => {
    const { clientId, clientSecret } = provisioned();
    const t = svc().exchangeClientCredentials({ clientId, clientSecret });
    expect(t.scope.split(' ')).not.toContain('user:private');
    expect(svc().introspect(t.access_token).scopes).not.toContain('user:private');
  });

  it('caps a self-registered cc grant to public+social (social without consent)', () => {
    const { clientId, clientSecret } = selfRegistered(['social', 'tools:read']);
    const t = svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['social'] });
    expect(t.scope).toBe('social');
    for (const s of t.scope.split(' ')) expect(CLIENT_CREDENTIALS_MAX_SCOPES).toContain(s);
  });

  it('negative control: social on cc still works', () => {
    const { clientId, clientSecret } = selfRegistered(['social']);
    expect(
      svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['social'] }).scope
    ).toBe('social');
  });

  it('durable provider refuses user:private on client_credentials too', async () => {
    const provider = new OAuth2Provider({ backend: new InMemoryTokenStore() });
    const reg = await provider.registerClient({
      clientName: 'p',
      redirectUris: [REDIRECT],
      scopes: ['tools:read', 'user:private'],
      clientType: 'confidential',
    });
    const r = await provider.handleToken({
      grant_type: 'client_credentials',
      client_id: reg.clientId,
      client_secret: reg.clientSecret,
      scope: 'user:private',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_scope');
    const ok = await provider.handleToken({
      grant_type: 'client_credentials',
      client_id: reg.clientId,
      client_secret: reg.clientSecret,
    });
    expect(ok.status).toBe(200);
    expect(String(ok.body.scope)).not.toContain('user:private');
  });

  it('consentFreeScopes drops user-bound scopes without a human, for every client', () => {
    expect(consentFreeScopes(undefined, ['tools:read', 'user:private'], undefined)).toEqual([
      'tools:read',
    ]);
    expect(consentFreeScopes({ selfRegistered: false }, ['user:private'], undefined)).toEqual([]);
    expect(consentFreeScopes({ selfRegistered: true }, ['user:private'], { userId: 'u' })).toEqual(
      ['user:private']
    );
    expect(USER_BOUND_SCOPES).toEqual(['user:private']);
  });

  it('user:private is a registrable scope (so a client can later ask a human for it)', () => {
    expect(getInvalidPublicOAuthScopes(['user:private'])).toEqual([]);
    expect(getInvalidPublicOAuthScopes(['admin'])).toEqual(['admin']);
  });
});

// ── R2 / (b) ────────────────────────────────────────────────────────────────
describe('R2/b the human is bound to code, access and refresh token', () => {
  it('stamps userId + grantId on access and refresh tokens and carries them across refresh', () => {
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const at = svc().introspect(t.access_token);
    expect(at.active).toBe(true);
    expect(at.userId).toBe('alice');
    expect(at.grantId).toBeTruthy();
    const rt = svc().getRefreshTokenRecord(t.refresh_token!);
    expect(rt?.userId).toBe('alice');
    expect(rt?.grantId).toBe(at.grantId);
    const t2 = svc().refreshAccessToken({
      refreshToken: t.refresh_token!,
      clientId,
      clientSecret,
    });
    expect(svc().introspect(t2.access_token).userId).toBe('alice');
  });

  it('one grant per (user, client): re-consent keeps the grant id', () => {
    const { clientId, clientSecret } = selfRegistered();
    const a = svc().introspect(exchange(clientId, clientSecret, codeFor(clientId)).access_token);
    const b = svc().introspect(exchange(clientId, clientSecret, codeFor(clientId)).access_token);
    const c = svc().introspect(
      exchange(clientId, clientSecret, codeFor(clientId, 'bob')).access_token
    );
    expect(a.grantId).toBe(b.grantId);
    expect(c.grantId).not.toBe(a.grantId);
  });

  it('revoking the grant kills its access token, refresh chain and unredeemed codes', () => {
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const pending = codeFor(clientId);
    const grantId = svc().introspect(t.access_token).grantId!;
    expect(svc().revokeGrant(grantId)).toBe(true);
    expect(svc().introspect(t.access_token).active).toBe(false);
    expect(() =>
      svc().refreshAccessToken({ refreshToken: t.refresh_token!, clientId, clientSecret })
    ).toThrow();
    expect(() => exchange(clientId, clientSecret, pending)).toThrow();
  });

  it('C3 a grant this instance never recorded is NOT live (fail closed)', () => {
    const { clientId } = selfRegistered();
    expect(
      svc().grantIsLive({ grantId: 'grant_unknown', userId: 'alice', clientId, issuedAt: Date.now() })
    ).toBe(false);
  });

  it('C3 cross-restart: a revoked grant does not revive when a fresh instance loads the token rows', async () => {
    const provider = new OAuth2Provider({ backend: new InMemoryTokenStore() });
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const live = svc().introspect(t.access_token);
    const social = svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['social'] });
    for (const [tok, rec] of [
      [t.access_token, live],
      [social.access_token, svc().introspect(social.access_token)],
    ] as const) {
      await provider.importAccessToken({
        token: tok,
        clientId,
        scopes: rec.scopes as string[],
        issuedAt: rec.issuedAt!,
        expiresAt: rec.expiresAt!,
        ...(rec.userId ? { userId: rec.userId, grantId: rec.grantId } : {}),
      } as never);
    }
    svc().revokeGrant(live.grantId!);

    // Deploy: the in-memory ledger (tombstones included) is gone; durable rows survive.
    resetOAuth21Service();
    const fresh = svc();
    fresh.setDurableIntrospector(async (token) => {
      const r = await provider.introspect(token);
      if (!r.active) return undefined;
      return {
        active: true,
        clientId: r.clientId,
        scopes: r.scopes as string[],
        agentId: r.agentId,
        expiresAt: r.expiresAt,
        issuedAt: r.issuedAt,
        ...(r.userId ? { userId: r.userId, grantId: r.grantId } : {}),
      };
    });
    fresh.setClientStatusResolver(async () => 'approved');

    const revived = await fresh.authenticateRequestAsync({ authorization: `Bearer ${t.access_token}` });
    expect(revived.active).toBe(false);
    expect(fresh.introspect(t.access_token).active).toBe(false);
    // Negative control: a token with no human (no grant) still rehydrates.
    const ctl = await fresh.authenticateRequestAsync({ authorization: `Bearer ${social.access_token}` });
    expect(ctl.active).toBe(true);
  });

  it('a revoked grant cannot be resurrected by a durable token row carrying its id', () => {
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const grantId = svc().introspect(t.access_token).grantId!;
    svc().revokeGrant(grantId);
    expect(
      svc().grantIsLive({ grantId, userId: 'alice', clientId, issuedAt: Date.now() })
    ).toBe(false);
  });

  it('grant expires 30 days idle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const grantId = svc().introspect(t.access_token).grantId!;
    const start = Date.now();
    expect(svc().grantIsLive({ grantId, userId: 'alice', clientId }, start + GRANT_IDLE_MS - 1000)).toBe(true);
    expect(svc().grantIsLive({ grantId, userId: 'alice', clientId }, start + GRANT_IDLE_MS + 1000)).toBe(false);
  });

  it('grant expires 90 days after consent even when used every day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const grantId = svc().introspect(t.access_token).grantId!;
    const start = Date.now();
    for (let d = 1; d <= 89; d += 20) {
      expect(svc().grantIsLive({ grantId, userId: 'alice', clientId }, start + d * 86400000, true)).toBe(true);
    }
    expect(
      svc().grantIsLive({ grantId, userId: 'alice', clientId }, start + GRANT_MAX_AGE_MS + 1, true)
    ).toBe(false);
  });

  it('negative control: a token with no human is unaffected by the grant ledger', () => {
    const { clientId, clientSecret } = selfRegistered(['social']);
    const t = svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['social'] });
    const at = svc().introspect(t.access_token);
    expect(at.active).toBe(true);
    expect(at.userId).toBeUndefined();
  });

  it('a user:private token without a human is never active (imported row)', () => {
    const { clientId } = provisioned();
    svc().importAccessToken({
      token: 'forged',
      clientId,
      scopes: ['user:private'],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    expect(svc().introspect('forged').active).toBe(false);
  });

  describe('CSRF token', () => {
    const b = { clientId: 'hsc_1', redirectUri: REDIRECT, codeChallenge: CHALLENGE, userId: 'alice' };
    const S = 's'.repeat(40);
    it('verifies for the same request', () => {
      expect(verifyOAuthCsrfToken(issueOAuthCsrfToken(b, Date.now(), S), b, Date.now(), S)).toBe(true);
    });
    it('refuses another client, redirect or challenge', () => {
      const t = issueOAuthCsrfToken(b, Date.now(), S);
      expect(verifyOAuthCsrfToken(t, { ...b, clientId: 'hsc_2' }, Date.now(), S)).toBe(false);
      expect(verifyOAuthCsrfToken(t, { ...b, redirectUri: 'https://evil.test/cb' }, Date.now(), S)).toBe(false);
      expect(verifyOAuthCsrfToken(t, { ...b, codeChallenge: 'x' }, Date.now(), S)).toBe(false);
    });
    it('F2 refuses a token minted for another user', () => {
      const t = issueOAuthCsrfToken(b, Date.now(), S);
      expect(verifyOAuthCsrfToken(t, { ...b, userId: 'bob' }, Date.now(), S)).toBe(false);
      expect(verifyOAuthCsrfToken(t, { ...b, userId: '' }, Date.now(), S)).toBe(false);
    });
    it('refuses expired, missing, malformed, and other-secret tokens', () => {
      const now = Date.now();
      const t = issueOAuthCsrfToken(b, now, S);
      expect(verifyOAuthCsrfToken(t, b, now + (OAUTH_CSRF_TTL_S + 1) * 1000, S)).toBe(false);
      expect(verifyOAuthCsrfToken(undefined, b, now, S)).toBe(false);
      expect(verifyOAuthCsrfToken('c1.1.x', b, now, S)).toBe(false);
      expect(verifyOAuthCsrfToken(t, b, now, 'o'.repeat(40))).toBe(false);
    });
  });
});

// ── R3 / (c) ────────────────────────────────────────────────────────────────
describe('R3/c user:private gates the private tools; handlers use the token user', () => {
  const PRIVATE = ['get_creator_earnings', 'absorb_check_credits'];
  const SHARED_STORE = [
    'holo_memory_list',
    'holo_memory_recall',
    'holo_memory_farm',
    'holo_memory_stats',
    'workflow_memory_read',
  ];

  it.each(SHARED_STORE)(
    'C2 %s reads one shared store: tools:admin until it is split; user:private is refused',
    (tool) => {
      expect(USER_PRIVATE_TOOLS.has(tool)).toBe(false);
      expect(resolveRequiredScopes(tool)).toEqual(['tools:admin']);
      expect(authorizeToolCall(tool, ['user:private']).authorized).toBe(false);
      expect(authorizeToolCall(tool, ['tools:read']).authorized).toBe(false);
      expect(authorizeToolCall(tool, ['tools:admin']).authorized).toBe(true);
    }
  );

  it('C2 scope map: shared-store memory tools map to exactly tools:admin, private tools to exactly user:private', () => {
    expect(
      Object.fromEntries(
        [...SHARED_STORE, 'workflow_memory_subscribe'].map((t) => [t, resolveRequiredScopes(t)])
      )
    ).toEqual({
      holo_memory_list: ['tools:admin'],
      holo_memory_recall: ['tools:admin'],
      holo_memory_farm: ['tools:admin'],
      holo_memory_stats: ['tools:admin'],
      workflow_memory_read: ['tools:admin'],
      workflow_memory_subscribe: ['tools:admin'],
    });
    expect([...USER_PRIVATE_TOOLS].sort()).toEqual(['absorb_check_credits', 'get_creator_earnings']);
    for (const t of USER_PRIVATE_TOOLS) expect(resolveRequiredScopes(t)).toEqual(['user:private']);
  });

  it('workflow_memory_subscribe (same shared store) is tools:admin; tools:read and user:private refused', () => {
    expect(authorizeToolCall('workflow_memory_subscribe', ['tools:read']).authorized).toBe(false);
    expect(authorizeToolCall('workflow_memory_subscribe', ['user:private']).authorized).toBe(false);
    expect(authorizeToolCall('workflow_memory_subscribe', ['tools:admin']).authorized).toBe(true);
  });

  it('C1 absorb_check_credits refuses a caller-supplied apiKey', () => {
    const ctx = { userId: 'alice', scopes: ['user:private'], signer: 'c' };
    expect(bindUserPrivateArgs('absorb_check_credits', { apiKey: 'someone-elses' }, ctx).ok).toBe(false);
    expect(bindUserPrivateArgs('absorb_check_credits', { api_key: 'k' }, ctx).ok).toBe(false);
    const ok = bindUserPrivateArgs('absorb_check_credits', {}, ctx);
    expect(ok.ok && (ok as { args: Record<string, unknown> }).args.userId).toBe('alice');
  });

  it.each(PRIVATE)('%s needs user:private; tools:read alone is refused', (tool) => {
    expect(USER_PRIVATE_TOOLS.has(tool)).toBe(true);
    expect(resolveRequiredScopes(tool)).toEqual(['user:private']);
    expect(authorizeToolCall(tool, ['tools:read', 'social:read']).authorized).toBe(false);
    expect(authorizeToolCall(tool, ['user:private']).authorized).toBe(true);
  });

  it('holomesh_wallet_status is admin-only', () => {
    expect(resolveRequiredScopes('holomesh_wallet_status')).toEqual(['tools:admin']);
    expect(authorizeToolCall('holomesh_wallet_status', ['tools:read']).authorized).toBe(false);
    expect(authorizeToolCall('holomesh_wallet_status', ['user:private']).authorized).toBe(false);
    expect(authorizeToolCall('holomesh_wallet_status', ['tools:admin']).authorized).toBe(true);
  });

  it('negative control: a public tool still needs only tools:read', () => {
    expect(authorizeToolCall('parse_hs', ['tools:read']).authorized).toBe(true);
    expect(USER_PRIVATE_TOOLS.has('parse_hs')).toBe(false);
  });

  it("a token can't read another creator's earnings", async () => {
    const ctx = { userId: 'alice', scopes: ['user:private'], signer: 'hsc_x' };
    const refused = bindUserPrivateArgs('get_creator_earnings', { creatorId: 'victim' }, ctx);
    expect(refused.ok).toBe(false);
    for (const key of ['creator_id', 'userId', 'user_id', 'ownerId']) {
      expect(bindUserPrivateArgs('get_creator_earnings', { [key]: 'victim' }, ctx).ok).toBe(false);
    }
    const bound = bindUserPrivateArgs('get_creator_earnings', {}, ctx);
    expect(bound.ok).toBe(true);
    const out = (await handleEconomyTool(
      'get_creator_earnings',
      (bound as { args: Record<string, unknown> }).args
    )) as { creatorId: string };
    expect(out.creatorId).toBe('alice');
  });

  it('naming yourself is fine; no user on the token is refused', () => {
    const ctx = { userId: 'alice', scopes: ['user:private'] };
    expect(bindUserPrivateArgs('get_creator_earnings', { creatorId: 'alice' }, ctx).ok).toBe(true);
    expect(
      bindUserPrivateArgs('absorb_check_credits', {}, { scopes: ['user:private'], signer: 'c' } as never).ok
    ).toBe(false);
  });

  it('admin keeps cross-creator reads; non-private tools are untouched', () => {
    const admin = { scopes: ['admin:*'], signer: 'admin' };
    const r = bindUserPrivateArgs('get_creator_earnings', { creatorId: 'anyone' }, admin as never);
    expect(r.ok && (r as { args: Record<string, unknown> }).args.creatorId).toBe('anyone');
    const p = bindUserPrivateArgs('parse_hs', { userId: 'x' }, { scopes: [], signer: 's' } as never);
    expect(p.ok && (p as { args: Record<string, unknown> }).args.userId).toBe('x');
  });
});

// ── R4 / (d) ────────────────────────────────────────────────────────────────
describe('R4/d client revoke kills everything; who may delete', () => {
  it('in-memory revokeClient drops access tokens, refresh chains, codes and grants', () => {
    const { clientId, clientSecret } = selfRegistered();
    const t = exchange(clientId, clientSecret, codeFor(clientId));
    const pending = codeFor(clientId, 'bob');
    const grantId = svc().introspect(t.access_token).grantId!;
    expect(svc().revokeClient(clientId)).toBe(true);
    expect(svc().introspect(t.access_token).active).toBe(false);
    expect(svc().getGrant(grantId)?.revokedAt).toBeTruthy();
    expect(() =>
      svc().refreshAccessToken({ refreshToken: t.refresh_token!, clientId, clientSecret })
    ).toThrow();
    expect(() => exchange(clientId, clientSecret, pending)).toThrow();
    expect(() =>
      svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['social'] })
    ).toThrow(/Invalid client_id/);
    expect(svc().revokeClient(clientId)).toBe(false); // idempotent
  });

  it('durable TokenStore.revokeClient deletes client, access, refresh and auth codes', async () => {
    const backend = new InMemoryTokenStore();
    const store = new TokenStore({ backend, cleanupIntervalMs: 0 });
    const reg = await store.registerClient({
      clientName: 'd',
      redirectUris: [REDIRECT],
      scopes: ['tools:read'],
      clientType: 'confidential',
    });
    const pair = await store.issueTokenPair({ clientId: reg.clientId, scopes: ['tools:read'] });
    await backend.setAuthorizationCode({
      code: 'code-1',
      clientId: reg.clientId,
      redirectUri: REDIRECT,
      scopes: ['tools:read'],
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      expiresAt: Date.now() + 60_000,
      used: false,
    } as never);
    expect(await store.revokeClient(reg.clientId)).toBe(true);
    expect(await backend.getClient(reg.clientId)).toBeUndefined();
    expect(await backend.getAccessToken(pair.accessToken.token)).toBeUndefined();
    expect(await backend.getRefreshToken(pair.refreshToken.token)).toBeUndefined();
    expect(await backend.getAuthorizationCode('code-1')).toBeUndefined();
    store.destroy();
  });

  it('owner (own token, bound agent, client secret) or admin may delete; others may not', () => {
    const base = { targetClientId: 'hsc_t', isAdmin: false, secretMatches: false };
    expect(clientDeletionActor({ ...base, auth: { active: false } })).toMatchObject({ ok: false, status: 401 });
    expect(
      clientDeletionActor({ ...base, auth: { active: true, clientId: 'hsc_other' } })
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      clientDeletionActor({ ...base, auth: { active: true, clientId: 'hsc_t' } })
    ).toMatchObject({ ok: true, role: 'owner' });
    expect(
      clientDeletionActor({
        ...base,
        auth: { active: true, clientId: 'hsc_o', agentId: 'Agent-A' },
        boundAgentId: 'agent-a',
      })
    ).toMatchObject({ ok: true, role: 'owner' });
    expect(
      clientDeletionActor({
        ...base,
        auth: { active: true, clientId: 'hsc_o', agentId: 'agent-b' },
        boundAgentId: 'agent-a',
      })
    ).toMatchObject({ ok: false, status: 403 });
    expect(clientDeletionActor({ ...base, secretMatches: true, auth: { active: false } })).toMatchObject({
      ok: true,
      role: 'owner',
    });
    expect(
      clientDeletionActor({ ...base, isAdmin: true, auth: { active: true, clientId: 'x' } })
    ).toMatchObject({ ok: true, role: 'admin' });
  });

  it('parses HTTP Basic client credentials', () => {
    const h = `Basic ${Buffer.from('hsc_a:s3cr:et').toString('base64')}`;
    expect(parseBasicClientCredentials(h)).toEqual({ clientId: 'hsc_a', clientSecret: 's3cr:et' });
    expect(parseBasicClientCredentials('Bearer x')).toBeNull();
    expect(parseBasicClientCredentials(undefined)).toBeNull();
  });
});
