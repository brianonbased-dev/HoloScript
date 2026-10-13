/**
 * Muse Gap 9, Mapping second-seat BLOCK fixes:
 *  S1  suspension reaches tokens rehydrated from the durable store (multi-replica);
 *  no founder bypass on /api/credits/check; consent replay; per-client 429.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_STATUS_TTL_MS, getOAuth21Service, resetOAuth21Service } from '../oauth21';
import type { TokenIntrospection } from '../oauth21';
import { OAuth2Provider } from '../../auth/oauth2-provider';
import { InMemoryTokenStore } from '../../auth/token-store';
import {
  CONSENT_REPLAY_MAX,
  resetConsentReplayGuard,
  signStudioConsent,
  verifyStudioConsent,
} from '../studio-consent';
import { installClientRateLimitStatus } from '../client-abuse-limits';
import { creditCheckSubject } from '../credit-check-subject';

const SECRET = 'x'.repeat(40);
const REDIRECT = 'http://localhost/cb';

function svc() {
  return getOAuth21Service({ legacyApiKey: '', migrationMode: 'strict' });
}

/** Wire a fresh oauth21 "replica" to a shared durable provider, like http-server does. */
function wire(provider: OAuth2Provider) {
  const s = svc();
  s.setDurableIntrospector(async (token): Promise<TokenIntrospection | undefined> => {
    const r = await provider.introspect(token);
    if (!r.active) return undefined;
    return {
      active: true,
      clientId: r.clientId,
      scopes: r.scopes as TokenIntrospection['scopes'],
      agentId: r.agentId,
      expiresAt: r.expiresAt,
      issuedAt: r.issuedAt,
      ...(r.userId ? { userId: r.userId, grantId: r.grantId } : {}),
    };
  });
  s.setClientStatusResolver(async (id) => {
    const c = await provider.getClient(id);
    return c ? (c.status ?? 'approved') : 'unknown';
  });
  return s;
}

async function durableClientWithToken(store: InMemoryTokenStore, token = 'dur-1') {
  const provider = new OAuth2Provider({ backend: store });
  const reg = await provider.registerClient({
    clientName: 'gap9-s1',
    redirectUris: [REDIRECT],
    scopes: ['social'],
    selfRegistered: true,
  });
  const now = Date.now();
  await provider.importAccessToken({
    token,
    clientId: reg.clientId,
    scopes: ['social'],
    issuedAt: now,
    expiresAt: now + 3_600_000,
  });
  return { provider, clientId: reg.clientId };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

beforeEach(() => {
  resetOAuth21Service();
  resetConsentReplayGuard();
});
afterEach(() => {
  vi.useRealTimers();
  resetOAuth21Service();
});

describe('S1: suspension reaches rehydrated tokens', () => {
  it('fresh instance accepts a durable token, then refuses it after a suspend written to the store by another instance', async () => {
    const store = new InMemoryTokenStore();
    const { provider, clientId } = await durableClientWithToken(store);
    const replicaB = wire(provider);
    expect((await replicaB.authenticateRequestAsync(bearer('dur-1'))).active).toBe(true);
    // Client is NOT loaded on this instance (the old bug's precondition).
    expect(replicaB.getClient(clientId)).toBeUndefined();

    // "Replica A" suspends through its own provider over the same store, but
    // leaves the token row in place to prove the status re-check alone refuses it.
    const replicaA = new OAuth2Provider({ backend: store });
    const row = await replicaA.getClient(clientId);
    await store.setClient({ ...row!, status: 'suspended' });

    vi.useFakeTimers({ now: Date.now() + CLIENT_STATUS_TTL_MS + 1 });
    expect(replicaB.introspect('dur-1').active).toBe(false); // stale status: sync refuses
    expect((await replicaB.authenticateRequestAsync(bearer('dur-1'))).active).toBe(false);
    replicaA.destroy();
    provider.destroy();
  });

  it('suspend via the store (tokens deleted) is refused immediately on refresh, and the cache entry is dropped', async () => {
    const store = new InMemoryTokenStore();
    const { provider, clientId } = await durableClientWithToken(store, 'dur-2');
    const s = wire(provider);
    expect((await s.authenticateRequestAsync(bearer('dur-2'))).active).toBe(true);
    await provider.setClientStatus(clientId, 'suspended');
    vi.useFakeTimers({ now: Date.now() + CLIENT_STATUS_TTL_MS + 1 });
    expect((await s.authenticateRequestAsync(bearer('dur-2'))).active).toBe(false);
    provider.destroy();
  });

  it('setClientStatus on an instance that never loaded the client still drops its cached tokens', async () => {
    const store = new InMemoryTokenStore();
    const { provider, clientId } = await durableClientWithToken(store, 'dur-3');
    const s = wire(provider);
    expect((await s.authenticateRequestAsync(bearer('dur-3'))).active).toBe(true);
    expect(s.setClientStatus(clientId, 'suspended')).toBe(false); // not loaded here
    expect(s.introspect('dur-3').active).toBe(false);
    provider.destroy();
  });

  it('a durable token whose client is unknown to the store is not accepted or cached', async () => {
    const store = new InMemoryTokenStore();
    const provider = new OAuth2Provider({ backend: store });
    const now = Date.now();
    await provider.importAccessToken({
      token: 'orphan',
      clientId: 'hsc_gone',
      scopes: ['social'],
      issuedAt: now,
      expiresAt: now + 60_000,
    });
    const s = wire(provider);
    expect((await s.authenticateRequestAsync(bearer('orphan'))).active).toBe(false);
    expect(s.introspect('orphan').active).toBe(false);
    provider.destroy();
  });

  it('a loaded, approved client keeps working across the TTL (status re-read, not a logout)', async () => {
    const store = new InMemoryTokenStore();
    const { provider } = await durableClientWithToken(store, 'dur-4');
    const s = wire(provider);
    expect((await s.authenticateRequestAsync(bearer('dur-4'))).active).toBe(true);
    vi.useFakeTimers({ now: Date.now() + CLIENT_STATUS_TTL_MS + 1 });
    expect((await s.authenticateRequestAsync(bearer('dur-4'))).active).toBe(true);
    provider.destroy();
  });
});

describe('credits/check: no founder bypass', () => {
  it('the route has no founder bypass; operators use tools:admin', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'http-server.ts'), 'utf8');
    const start = src.indexOf("url === '/api/credits/check'");
    const end = src.indexOf("url === '/api/credits/deduct'");
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, end > start ? end : start + 4000);
    expect(block).not.toMatch(/isFounderRequest\(/);
    expect(block).not.toMatch(/founderBypass/);
    expect(block).toMatch(/creditCheckSubject\(/);
    // A founder-style token with no user and no operator scope gets 403.
    expect(creditCheckSubject({ scopes: ['tools:read'] }, 'anyone')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(creditCheckSubject({ scopes: ['tools:admin'] }, 'u1')).toEqual({
      ok: true,
      userId: 'u1',
    });
  });
});

describe('consent replay', () => {
  it('an assertion verifies at most once; grant id is stable per assertion', () => {
    const a = signStudioConsent({ sub: 'u1', cid: 'hsc_1', scp: ['tools:execute'] }, SECRET);
    const first = verifyStudioConsent(a, 'hsc_1', SECRET);
    expect(first?.userId).toBe('u1');
    expect(first?.grantId).toMatch(/^grant_[0-9a-f]{32}$/);
    expect(verifyStudioConsent(a, 'hsc_1', SECRET)).toBeNull();
    const b = signStudioConsent(
      { sub: 'u1', cid: 'hsc_1', scp: ['tools:execute'], gid: 'g2' },
      SECRET
    );
    expect(verifyStudioConsent(b, 'hsc_1', SECRET)?.grantId).toBe('g2');
  });

  it('a failed verification does not consume the assertion', () => {
    const a = signStudioConsent({ sub: 'u1', cid: 'hsc_1', scp: [] }, SECRET);
    expect(verifyStudioConsent(a, 'hsc_other', SECRET)).toBeNull();
    expect(verifyStudioConsent(a, 'hsc_1', SECRET)).not.toBeNull();
  });

  it('bounded: when full of unexpired entries it fails closed', () => {
    const now = Date.now();
    for (let i = 0; i < CONSENT_REPLAY_MAX; i++) {
      const a = signStudioConsent({ sub: `u${i}`, cid: 'hsc_1', scp: [] }, SECRET, now);
      expect(verifyStudioConsent(a, 'hsc_1', SECRET, now)).not.toBeNull();
    }
    const extra = signStudioConsent({ sub: 'late', cid: 'hsc_1', scp: [] }, SECRET, now);
    expect(verifyStudioConsent(extra, 'hsc_1', SECRET, now)).toBeNull();
    // After those expire, the sweep frees room.
    const later = now + 301_000;
    const fresh = signStudioConsent({ sub: 'late2', cid: 'hsc_1', scp: [] }, SECRET, later);
    expect(verifyStudioConsent(fresh, 'hsc_1', SECRET, later)).not.toBeNull();
  });
});

describe('per-client rate limit answers 429, not 401', () => {
  function fakeRes() {
    const calls: unknown[][] = [];
    const headers: Record<string, string> = {};
    return {
      calls,
      headers,
      writeHead: (...args: unknown[]) => {
        calls.push(args);
      },
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
  }

  it('a marked request has its 401 rewritten to 429 with Retry-After', () => {
    const req = {};
    const marks = new WeakMap<object, number>([[req, 10_000]]);
    const res = fakeRes();
    installClientRateLimitStatus(req, res, marks, () => 4_200);
    res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
    expect(res.calls[0][0]).toBe(429);
    expect(res.calls[0][1]).toEqual({ 'Content-Type': 'application/json', 'Retry-After': '6' });
  });

  it('control: unmarked requests and non-401 statuses pass through', () => {
    const req = {};
    const res = fakeRes();
    installClientRateLimitStatus(req, res, new WeakMap());
    res.writeHead(401, {});
    const req2 = {};
    const res2 = fakeRes();
    installClientRateLimitStatus(req2, res2, new WeakMap([[req2, Date.now() + 1000]]));
    res2.writeHead(200, {});
    expect(res.calls[0][0]).toBe(401);
    expect(res2.calls[0][0]).toBe(200);
  });

  it('http-server marks the request when the client limiter refuses', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'http-server.ts'), 'utf8');
    expect(src).toMatch(/clientRateLimitedRequests\.set\(req, hit\.resetAt\)/);
    expect(src).toMatch(/installClientRateLimitStatus\(req, res, clientRateLimitedRequests\)/);
  });
});
