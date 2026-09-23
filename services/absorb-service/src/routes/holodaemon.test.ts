/**
 * A daemon run is charged to a signed-in user (a uuid), never to anything else.
 *
 * task_1790064120726_h0yq: POST /api/holodaemon {action:'start'} charged
 * `authReq.userId || 'anonymous'`. creditAccounts.userId is a uuid column, so any
 * non-uuid identity threw "invalid input syntax for type uuid" and the route
 * answered 500 to every caller whose token did not resolve to a user. PR #311
 * fixes the same fault in credits.ts.
 *
 * Test shape, ruled under /founder (2026-09-22, re-ruled 2026-09-23 after
 * claude3's and claude2's reviews of #320): the ledger behind requireCredits
 * and deductCredits is the production credits table, and a unit test must not
 * charge it; the daemon job store starts a real run. So this file observes
 * those two module seams, as credits.test.ts and admin.test.ts do, and cuts
 * the db/client import the auth helper pulls in (credits.test.ts:35), which
 * is what lets it run in a clean checkout. The preferred shape is claude3's
 * real-Postgres (PGlite) version of this test, which proved 5 non-uuid
 * identities x 3 profiles write zero ledger rows; it needs a new dev
 * dependency that is not installed here, so it is not in this file.
 * Named limitation: this file proves the route's contract (every non-uuid
 * identity the service can produce is refused before any ledger call, and
 * every value that reaches a ledger seam is a uuid), not Postgres's uuid
 * cast; the live proof is the deployed route answering 403, not 500.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  requireCredits: vi.fn(
    async (_userId: string, _opType: string): Promise<Record<string, unknown>> => ({ costCents: 100 })
  ),
  deductCredits: vi.fn(async (_userId: string, _cents: number, _why: string, _meta?: unknown) => ({
    balanceCents: 900,
  })),
  createDaemonJob: vi.fn((_input: Record<string, unknown>) => ({ id: 'job-1', status: 'queued' })),
  listDaemonJobs: vi.fn(() => []),
  getTelemetrySummary: vi.fn(() => ({})),
}));

vi.mock('@holoscript/absorb-service/credits', () => ({
  requireCredits: mocks.requireCredits,
  deductCredits: mocks.deductCredits,
  // The REAL predicate (packages/absorb-service/src/credits/requireCredits.ts:87-89),
  // not a stand-in: a credit error is any result carrying both `error` and `status`.
  isCreditError: (result: Record<string, unknown>) => 'error' in result && 'status' in result,
}));

vi.mock('../daemon/jobs/store.js', () => ({
  listDaemonJobs: mocks.listDaemonJobs,
  getTelemetrySummary: mocks.getTelemetrySummary,
  createDaemonJob: mocks.createDaemonJob,
}));

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER = '11111111-2222-4333-8444-555555555555';

type Handler = (req: Request, res: Response) => Promise<unknown>;

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> };
}

interface MockRes {
  _status: number;
  _json: Record<string, unknown> | null;
  status(code: number): MockRes;
  json(data: Record<string, unknown>): MockRes;
}

let handle: Handler;

// One import for the whole file: a cold import of the router once took past the
// default 5 s in six runs (claude2's review).
beforeAll(async () => {
  const { holodaemonRouter } = await import('./holodaemon.js');
  const stack = (holodaemonRouter as unknown as { stack: RouteLayer[] }).stack;
  const route = stack.find((l) => l.route?.path === '/' && l.route.methods.post)?.route;
  if (!route) throw new Error('no post / route');
  handle = route.stack[route.stack.length - 1].handle;
}, 30_000);

function startReq(profile: string | undefined, userId: unknown): Request {
  return {
    body: { action: 'start', profile },
    query: {},
    headers: {},
    params: {},
    userId,
  } as unknown as Request;
}

function mockRes(): MockRes {
  const res: MockRes = {
    _status: 200,
    _json: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      return res;
    },
  };
  return res;
}

// Every non-uuid identity the service can actually produce, and where it comes from.
const NON_UUIDS: Array<[string, unknown]> = [
  ['unset (a service key whose token resolves to no user)', undefined],
  ['empty string', ''],
  ['the legacy literal anonymous', 'anonymous'],
  ['the MCPMe orchestrator id auth.ts sets (orchestrator:<key>)', 'orchestrator:key-1'],
  ['the service principal mcp-handler.ts uses', 'service:absorb-api-key'],
  ['a uuid one character short', USER.slice(0, -1)],
  ['a uuid with trailing junk', `${USER}x`],
];
const OP: Record<string, string> = { quick: 'daemon_quick', balanced: 'daemon_balanced', deep: 'daemon_deep' };

describe.each(['quick', 'balanced', 'deep', undefined] as Array<string | undefined>)(
  'POST /api/holodaemon start, profile=%s',
  (profile) => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each(NON_UUIDS)('refuses %s: 403, and no ledger seam or job is touched', async (_label, id) => {
      const res = mockRes();
      await handle(startReq(profile, id), res as unknown as Response);
      expect(res._status).toBe(403);
      expect(res._json).toMatchObject({ error: 'User identity required' });
      expect(mocks.requireCredits).not.toHaveBeenCalled();
      expect(mocks.deductCredits).not.toHaveBeenCalled();
      expect(mocks.createDaemonJob).not.toHaveBeenCalled();
    });

    it('charges a uuid: the operation follows the profile, and every value handed to a ledger seam is a uuid', async () => {
      const res = mockRes();
      await handle(startReq(profile, USER), res as unknown as Response);
      expect(res._status).toBe(201);
      expect(res._json).toMatchObject({ cost: 100 });
      expect(mocks.requireCredits).toHaveBeenCalledWith(USER, OP[profile ?? 'balanced']);
      expect(mocks.deductCredits).toHaveBeenCalledTimes(1);
      for (const call of mocks.requireCredits.mock.calls) expect(call[0]).toMatch(UUID_RE);
      for (const call of mocks.deductCredits.mock.calls) expect(call[0]).toMatch(UUID_RE);
      for (const call of mocks.createDaemonJob.mock.calls) expect(String(call[0].userId)).toMatch(UUID_RE);
    });
  }
);

describe('POST /api/holodaemon start with too few credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers 402 with the credit error it was given, and starts and charges nothing', async () => {
    const creditError = { error: 'Insufficient credits', status: 402, requiredCents: 100, balanceCents: 0 };
    mocks.requireCredits.mockResolvedValueOnce(creditError);
    const res = mockRes();
    await handle(startReq('deep', USER), res as unknown as Response);
    expect(res._status).toBe(402);
    expect(res._json).toEqual(creditError);
    expect(mocks.createDaemonJob).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });
});