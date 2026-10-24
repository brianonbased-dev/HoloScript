import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';

const mockResolveGitHubToken = vi.fn();
vi.mock('./github-identity.js', () => ({
  resolveGitHubToken: (...args: any[]) => mockResolveGitHubToken(...args),
}));
const mockGetOrCreateAccount = vi.fn();
vi.mock('@holoscript/absorb-service/credits', () => ({
  getOrCreateAccount: (...args: any[]) => mockGetOrCreateAccount(...args),
}));
vi.mock('../db/client.js', () => ({ getDb: () => null }));

import {
  __resetOrchestratorNoncesForTests,
  authMiddleware,
  orchestratorSigMessage,
  verifyOrchestratorSig,
  verifyLegacyOrchestratorSig,
  ABSORB_BILLED_HEADER,
  type AuthenticatedRequest,
} from './auth.js';

const SECRET = 'orch-secret-test';
const USER = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const OTHER = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const SCAN = '/api/absorb/scan';
let nonceSeq = 0;
const freshNonce = () => `nonce-${Date.now()}-${++nonceSeq}-abcdef`;

function sign(o: { method?: string; path?: string; key?: string; tier?: string; user: string; nonce: string; at?: number }): string {
  const w = Math.floor((o.at ?? Date.now()) / 30_000);
  const msg = orchestratorSigMessage(o.method ?? 'POST', o.path ?? SCAN, o.key ?? 'key-1', o.tier ?? 'agent', o.user, o.nonce, w);
  return createHmac('sha256', SECRET).update(msg).digest('hex');
}

function attested(user: string, nonce: string, sig: string): Record<string, string> {
  return {
    'x-mcpme-orchestrator-key': 'key-1',
    'x-mcpme-orchestrator-tier': 'agent',
    'x-mcpme-orchestrator-user': user,
    'x-mcpme-orchestrator-nonce': nonce,
    'x-mcpme-orchestrator-sig-v1': sig,
  };
}

function req(headers: Record<string, string>, path = SCAN, method = 'POST'): AuthenticatedRequest {
  return {
    path: path.replace(/^\/api/, ''),
    baseUrl: '/api',
    originalUrl: path,
    method,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
}

function res(): Response & { statusCode: number; _json: any } {
  const r: any = {
    statusCode: 200,
    _json: null,
    headersSent: false,
    status(c: number) { r.statusCode = c; return r; },
    json(d: any) { r._json = d; return r; },
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k] = v; return r; },
  };
  return r;
}

describe('orchestrator attestation v1: account UUID, method + path binding, single-use nonce', () => {
  let next: NextFunction;
  const prevSecret = process.env.ORCHESTRATOR_SECRET;
  const prevApiKey = process.env.ABSORB_API_KEY;

  beforeEach(() => {
    next = vi.fn();
    process.env.ORCHESTRATOR_SECRET = SECRET;
    delete process.env.ABSORB_API_KEY;
    __resetOrchestratorNoncesForTests();
    mockResolveGitHubToken.mockReset();
    mockGetOrCreateAccount.mockReset();
    mockGetOrCreateAccount.mockResolvedValue({ tier: 'pro' });
  });
  afterEach(() => {
    if (prevSecret === undefined) delete process.env.ORCHESTRATOR_SECRET;
    else process.env.ORCHESTRATOR_SECRET = prevSecret;
    if (prevApiKey === undefined) delete process.env.ABSORB_API_KEY;
    else process.env.ABSORB_API_KEY = prevApiKey;
  });

  it('a valid v1 attestation runs once as that account (no Authorization header needed, no billing skip)', async () => {
    const nonce = freshNonce();
    const r = req(attested(USER, nonce, sign({ user: USER, nonce })));
    const out = res();
    await authMiddleware(r, out, next);
    expect(next).toHaveBeenCalledTimes(1);
    // Single biller (CoS 2026-10-24): auth only marks the request; the route sets
    // X-Absorb-Billed-Account + X-Absorb-Credit-Cost (informational) on a 2xx; absorb charges the UUID.
    expect(r.orchestratorBilled).toBe(true);
    expect(out.headers[ABSORB_BILLED_HEADER]).toBeUndefined();
    expect(r.userId).toBe(USER);
    expect(r.orchestratorGated).toBeUndefined();
    expect(r.tier).toBe('pro');
    expect(mockGetOrCreateAccount).toHaveBeenCalledWith(USER);
    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });

  it('a replay of the same signature is refused with 409 and never reaches the route (no second charge)', async () => {
    const nonce = freshNonce();
    const headers = attested(USER, nonce, sign({ user: USER, nonce }));
    await authMiddleware(req(headers), res(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const out = res();
    await authMiddleware(req(headers), out, next);
    expect(out.statusCode).toBe(409);
    expect(out._json).toMatchObject({ reason: 'orchestrator_attestation_replayed' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('a signature replayed to a different path is refused with 401', async () => {
    const nonce = freshNonce();
    const out = res();
    await authMiddleware(req(attested(USER, nonce, sign({ user: USER, nonce, path: '/api/absorb/projects' }))), out, next);
    expect(out.statusCode).toBe(401);
    expect(out._json).toMatchObject({ reason: 'orchestrator_attestation_invalid' });
    expect(next).not.toHaveBeenCalled();
  });

  it('a signature replayed with a different method is refused with 401', async () => {
    const nonce = freshNonce();
    const out = res();
    await authMiddleware(req(attested(USER, nonce, sign({ user: USER, nonce, method: 'GET' }))), out, next);
    expect(out.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('a signature without the v1 domain prefix (pre-v1 format) is refused with 401', async () => {
    const nonce = freshNonce();
    const w = Math.floor(Date.now() / 30_000);
    const legacy = createHmac('sha256', SECRET).update(`key-1:agent:${USER}:${w}`).digest('hex');
    const out = res();
    await authMiddleware(req(attested(USER, nonce, legacy)), out, next);
    expect(out.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('an attestation with no nonce is refused with 401', async () => {
    const h = attested(USER, 'x', sign({ user: USER, nonce: 'x' }));
    delete h['x-mcpme-orchestrator-nonce'];
    const out = res();
    await authMiddleware(req(h), out, next);
    expect(out.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('the old attestation without a UUID is refused with 401', async () => {
    const out = res();
    const h = attested(USER, freshNonce(), 'ab');
    delete h['x-mcpme-orchestrator-user'];
    delete h['x-mcpme-orchestrator-sig-v1'];
    h['x-mcpme-orchestrator-sig'] = 'ab';
    delete h['x-mcpme-orchestrator-tier'];
    await authMiddleware(req(h), out, next);
    expect(out.statusCode).toBe(401);
    expect(out._json).toMatchObject({ reason: 'orchestrator_attestation_no_user' });
    expect(next).not.toHaveBeenCalled();
  });

  it('a UUID swapped after signing is refused with 401', async () => {
    const nonce = freshNonce();
    const out = res();
    await authMiddleware(req(attested(OTHER, nonce, sign({ user: USER, nonce }))), out, next);
    expect(out.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('a non-UUID user (e.g. orchestrator:<key>) is refused with 401', async () => {
    const out = res();
    await authMiddleware(req(attested('orchestrator:key-1', freshNonce(), 'ab')), out, next);
    expect(out.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('tier lookup failure fails closed (503), not open to free', async () => {
    mockGetOrCreateAccount.mockRejectedValue(new Error('db down'));
    const nonce = freshNonce();
    const r = req(attested(USER, nonce, sign({ user: USER, nonce })));
    const out = res();
    await authMiddleware(r, out, next);
    expect(out.statusCode).toBe(503);
    expect(out._json).toMatchObject({ reason: 'tier_unavailable' });
    expect(next).not.toHaveBeenCalled();
    expect(r.tier).toBeUndefined();
  });

  it('GitHub-token path: tier lookup failure fails closed (503), not free', async () => {
    mockResolveGitHubToken.mockResolvedValue({ userId: USER, githubUsername: 'u', isAdmin: false });
    mockGetOrCreateAccount.mockRejectedValue(new Error('db down'));
    const out = res();
    await authMiddleware(req({ authorization: 'Bearer gh-token' }), out, next);
    expect(out.statusCode).toBe(503);
    expect(out._json).toMatchObject({ reason: 'tier_unavailable' });
    expect(next).not.toHaveBeenCalled();
  });

  describe('transition: old orchestrator -> new absorb (legacy format, account-unknown)', () => {
    const legacySig = (key = 'key-1', tier = 'agent', at = Date.now()) =>
      createHmac('sha256', SECRET).update(`${key}:${tier}:${Math.floor(at / 30_000)}`).digest('hex');
    const legacyHeaders = (sig: string) => ({
      'x-mcpme-orchestrator-key': 'key-1',
      'x-mcpme-orchestrator-tier': 'agent',
      'x-mcpme-orchestrator-sig': sig,
    });
    afterEach(() => { delete process.env.ABSORB_ACCEPT_LEGACY_ORCHESTRATOR_SIG; });

    it('is accepted as account-unknown: no userId, no tier, no billing skip, no absorb-billed header', async () => {
      const r = req(legacyHeaders(legacySig()));
      const out = res();
      await authMiddleware(r, out, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(r.authenticated).toBe(true);
      expect(r.userId).toBeUndefined();
      expect(r.tier).toBeUndefined();
      expect(r.orchestratorGated).toBeUndefined();
      expect(out.headers[ABSORB_BILLED_HEADER]).toBeUndefined();
      expect(r.orchestratorBilled).toBeUndefined();
      expect(mockGetOrCreateAccount).not.toHaveBeenCalled();
    });

    it('a legacy replay is refused with 409', async () => {
      const h = legacyHeaders(legacySig());
      await authMiddleware(req(h), res(), next);
      const out = res();
      await authMiddleware(req(h), out, next);
      expect(out.statusCode).toBe(409);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('a bad legacy signature is refused with 401', async () => {
      const out = res();
      await authMiddleware(req(legacyHeaders('ab'.repeat(32))), out, next);
      expect(out.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('N1: a legacy sig re-spelled (uppercase / trailing non-hex) is refused, so it cannot dodge the replay store', async () => {
      const sig = legacySig();
      await authMiddleware(req(legacyHeaders(sig)), res(), next);
      for (const variant of [sig.toUpperCase(), sig + 'zz', sig + 'g', sig.slice(0, 63) + 'G']) {
        const out = res();
        await authMiddleware(req(legacyHeaders(variant)), out, next);
        expect(out.statusCode).toBe(401);
      }
      expect(next).toHaveBeenCalledTimes(1);
      expect(verifyLegacyOrchestratorSig('key-1', 'agent', sig.toUpperCase())).toBe(false);
      expect(verifyLegacyOrchestratorSig('key-1', 'agent', sig + 'x')).toBe(false);
      expect(verifyLegacyOrchestratorSig('key-1', 'agent', sig)).toBe(true);
    });

    it('with the transition flag off, the legacy format is refused with 401', async () => {      process.env.ABSORB_ACCEPT_LEGACY_ORCHESTRATOR_SIG = 'false';
      const out = res();
      await authMiddleware(req(legacyHeaders(legacySig())), out, next);
      expect(out.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('a legacy signature cannot carry a user: a user header without v1 is refused', async () => {
      const out = res();
      await authMiddleware(req({ ...legacyHeaders(legacySig()), 'x-mcpme-orchestrator-user': USER }), out, next);
      expect(out.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('N1: a v1 sig must be exactly 64 lowercase hex: uppercase and trailing non-hex are refused', async () => {
    const n = freshNonce();
    const sig = sign({ user: USER, nonce: n });
    for (const variant of [sig.toUpperCase(), sig + 'zz', sig + '!', sig.slice(0, 63) + 'Z', sig.slice(0, 62)]) {
      const out = res();
      await authMiddleware(req(attested(USER, n, variant)), out, next);
      expect(out.statusCode).toBe(401);
      expect(verifyOrchestratorSig('POST', SCAN, 'key-1', 'agent', USER, n, variant)).toBe(false);
    }
    expect(next).not.toHaveBeenCalled();
    expect(verifyOrchestratorSig('POST', SCAN, 'key-1', 'agent', USER, n, sig)).toBe(true);
  });

  it('verifyOrchestratorSig accepts the current and previous window only', () => {    const now = 1_800_000_000_000;
    const n = 'nonce-fixed-0123456789';
    const at = (t: number) => sign({ user: USER, nonce: n, at: t });
    expect(verifyOrchestratorSig('POST', SCAN, 'key-1', 'agent', USER, n, at(now), now)).toBe(true);
    expect(verifyOrchestratorSig('POST', SCAN, 'key-1', 'agent', USER, n, at(now - 30_000), now)).toBe(true);
    expect(verifyOrchestratorSig('POST', SCAN, 'key-1', 'agent', USER, n, at(now - 60_000), now)).toBe(false);
  });
});
