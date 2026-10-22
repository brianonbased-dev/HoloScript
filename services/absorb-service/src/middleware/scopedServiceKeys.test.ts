/**
 * Scoped service key that charges a named owner (card absorb-service-key-path).
 * Refusals: no owner, owner outside the key's scope, bad config, over the rate
 * limit. Charging: a double call is charged once, a replay costs 0, and the
 * charge lands on the named owner (never a server or proxy identity).
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const h = vi.hoisted(() => ({
  debits: [] as Array<{ userId: string; meta: Record<string, unknown> }>,
  scans: 0,
  github: 0,
}));

vi.mock('./github-identity.js', () => ({
  resolveGitHubToken: vi.fn(async () => {
    h.github += 1;
    return null;
  }),
}));
vi.mock('@holoscript/absorb-service/credits', () => {
  const api = {
    getOrCreateAccount: vi.fn(async () => ({ tier: 'free' })),
    requireCredits: vi.fn(async (userId: string) => ({ userId, costCents: 10, operationType: 'absorb_shallow' })),
    deductCredits: vi.fn(async (userId: string, _c: number, _d: string, meta: Record<string, unknown>) => {
      h.debits.push({ userId, meta });
      return { balanceCents: 990 };
    }),
    isCreditError: (r: Record<string, unknown>) => 'error' in r && 'status' in r,
    CHARGE_GUARD_REFUSED: 'charge_guard_refused',
  };
  return { ...api, default: api };
});
vi.mock('@holoscript/absorb-service/engine', () => {
  const api = {
    absorbRootRefusal: () => null,
    CodebaseScanner: class {
      async scan() {
        h.scans += 1;
        return { files: [{ path: 'a.ts', imports: [] }], stats: { durationMs: 1, totalFiles: 1 } };
      }
    },
    CodebaseGraph: class {
      buildFromScanResult() {}
      serialize() {
        return '{}';
      }
    },
  };
  return { ...api, default: api };
});
vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

import { authMiddleware, __setRateLimiterForTests, type AuthenticatedRequest } from './auth.js';
import { MemoryRateCounterStore, RateLimiter } from './rateLimiter.js';
import { loadScopedServiceKeys, matchScopedKey, sha256Hex, SCOPED_KEYS_ENV } from './scopedServiceKeys.js';

const OWNER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
// Generated per run; a test value, not a credential.
const KEY = `test-scoped-${randomUUID()}`;
const KEY2 = `test-scoped-${randomUUID()}`;

function config(limit = 60) {
  return JSON.stringify([
    { id: 'agent-a', sha256: sha256Hex(KEY), owners: [OWNER], hourlyLimit: limit },
    { id: 'agent-b', sha256: sha256Hex(KEY2), owners: [OTHER], hourlyLimit: limit },
  ]);
}

function mockRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res as Response & { statusCode: number; body: any };
}

async function auth(token: string, owner?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (owner !== undefined) headers['x-absorb-charge-owner'] = owner;
  const req = { path: '/api/absorb/scan', method: 'POST', headers } as unknown as AuthenticatedRequest;
  const res = mockRes();
  const next = vi.fn() as unknown as NextFunction;
  await authMiddleware(req as unknown as Request, res, next);
  return { req, res, passed: (next as any).mock.calls.length === 1 };
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
let scan: Handler;
let reset: () => void;

beforeAll(async () => {
  const mod = await import('../routes/absorb.js');
  reset = mod.__resetImportsForTests;
  const stack = (mod.absorbRouter as any).stack as Array<any>;
  const route = stack.find((l) => l.route?.path === '/scan' && l.route.methods.post).route;
  scan = route.stack[route.stack.length - 1].handle;
}, 30_000);

beforeEach(() => {
  h.debits = [];
  h.scans = 0;
  h.github = 0;
  reset();
  process.env[SCOPED_KEYS_ENV] = config();
  delete process.env.ABSORB_API_KEY;
  __setRateLimiterForTests(new RateLimiter(new MemoryRateCounterStore(), 60 * 60 * 1000));
});

async function scanAs(token: string, owner: string, importId: string) {
  const a = await auth(token, owner);
  if (!a.passed) return a.res;
  (a.req as any).body = { path: '/srv/repo', projectId: 'p1', importId, shallow: true };
  const res = mockRes();
  await scan(a.req as unknown as Request, res);
  return res;
}

describe('config', () => {
  it('holds hashes only and fails closed on any malformed entry', () => {
    expect(loadScopedServiceKeys({ [SCOPED_KEYS_ENV]: config() })).toHaveLength(2);
    expect(loadScopedServiceKeys({ [SCOPED_KEYS_ENV]: 'nope' })).toEqual([]);
    const bad = JSON.stringify([
      { id: 'a', sha256: sha256Hex(KEY), owners: [OWNER] },
      { id: 'b', sha256: KEY, owners: [OWNER] }, // raw key, not a hash
    ]);
    expect(loadScopedServiceKeys({ [SCOPED_KEYS_ENV]: bad })).toEqual([]);
    expect(loadScopedServiceKeys({ [SCOPED_KEYS_ENV]: JSON.stringify([{ id: 'a', sha256: sha256Hex(KEY), owners: [] }]) })).toEqual([]);
  });
  it('matches by hash only', () => {
    const keys = loadScopedServiceKeys({ [SCOPED_KEYS_ENV]: config() });
    expect(matchScopedKey(KEY, keys)?.id).toBe('agent-a');
    expect(matchScopedKey(sha256Hex(KEY), keys)).toBeNull();
    expect(matchScopedKey('', keys)).toBeNull();
  });
});

describe('refusals (nothing runs, nothing charged)', () => {
  it('a key without scope for the owner is refused 403', async () => {
    const r = await scanAs(KEY, OTHER, 'imp-00000001');
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toBe('owner_not_in_key_scope');
    expect(h.scans).toBe(0);
    expect(h.debits).toHaveLength(0);
  });
  it('no owner named is 401 owner_required, and is not retried on another path', async () => {
    const a = await auth(KEY);
    expect(a.passed).toBe(false);
    expect(a.res.statusCode).toBe(401);
    expect(a.res.body.error).toBe('owner_required');
    expect(h.github).toBe(0);
  });
  it('a malformed owner is 400', async () => {
    const a = await auth(KEY, 'not-a-uuid');
    expect(a.res.statusCode).toBe(400);
  });
  it('with no scoped config the key is not a key (no fallback): 401', async () => {
    delete process.env[SCOPED_KEYS_ENV];
    const a = await auth(KEY, OWNER);
    expect(a.passed).toBe(false);
    expect(a.res.statusCode).toBe(401);
  });
  it('over the per-key rate limit is refused 429', async () => {
    process.env[SCOPED_KEYS_ENV] = config(2);
    expect((await auth(KEY, OWNER)).passed).toBe(true);
    expect((await auth(KEY, OWNER)).passed).toBe(true);
    const third = await auth(KEY, OWNER);
    expect(third.passed).toBe(false);
    expect(third.res.statusCode).toBe(429);
    expect(third.res.body.scope).toBe('key');
  });
  it('the owner cap counts across keys', async () => {
    process.env[SCOPED_KEYS_ENV] = JSON.stringify([
      { id: 'k1', sha256: sha256Hex(KEY), owners: [OWNER], hourlyLimit: 1000 },
      { id: 'k2', sha256: sha256Hex(KEY2), owners: [OWNER], hourlyLimit: 1000 },
    ]);
    let last;
    for (let i = 0; i < 61; i++) last = await auth(i % 2 ? KEY : KEY2, OWNER);
    expect(last!.res.statusCode).toBe(429);
    expect(last!.res.body.scope).toBe('owner');
  });
});

describe('charging the named owner', () => {
  it('runs as the owner and charges the owner', async () => {
    const r = await scanAs(KEY, OWNER, 'imp-00000002');
    expect(r.statusCode).toBe(200);
    expect(r.body.costCents).toBe(10);
    expect(h.debits).toEqual([{ userId: OWNER, meta: expect.objectContaining({ importId: 'imp-00000002' }) }]);
  });
  it('a double call is charged once and the replay costs 0', async () => {
    const first = await scanAs(KEY, OWNER, 'imp-00000003');
    const again = await scanAs(KEY, OWNER, 'imp-00000003');
    expect(first.statusCode).toBe(200);
    expect(again.statusCode).toBe(200);
    expect(again.body.cost).toBe(0);
    expect(again.body.replayed).toBe(true);
    expect(h.debits).toHaveLength(1);
    expect(h.scans).toBe(1);
  });
  it('a reused importId for another folder fails closed (import_id_reused)', async () => {
    await scanAs(KEY, OWNER, 'imp-00000004');
    const a = await auth(KEY, OWNER);
    (a.req as any).body = { path: '/srv/other', projectId: 'p1', importId: 'imp-00000004', shallow: true };
    const res = mockRes();
    await scan(a.req as unknown as Request, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('import_id_reused');
    expect(h.debits).toHaveLength(1);
  });
  it('the shared service key alone still names nobody: 401 account_required', async () => {
    process.env.ABSORB_API_KEY = KEY2 + '-shared';
    const a = await auth(KEY2 + '-shared');
    expect(a.passed).toBe(true);
    (a.req as any).body = { path: '/srv/repo', projectId: 'p1', importId: 'imp-00000005', shallow: true };
    const res = mockRes();
    await scan(a.req as unknown as Request, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('account_required');
    expect(h.scans).toBe(0);
  });
});