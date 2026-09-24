/**
 * A daemon run is charged to a signed-in user (a uuid), never to anything else.
 *
 * task_1790064120726_h0yq: POST /api/holodaemon {action:'start'} charged
 * `authReq.userId || 'anonymous'`. creditAccounts.userId is a uuid column, so any
 * non-uuid identity threw "invalid input syntax for type uuid" and the route
 * answered 500 to every caller whose token did not resolve to a user. PR #311
 * fixes the same fault in absorb.ts, credits.ts and creditsWebhook.ts.
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
 * identity is refused before any ledger call; a uuid is charged exactly its
 * profile's price, once, for one job it owns), not Postgres's uuid cast; the
 * live proof is the deployed route answering 403, not 500.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { CreditError } from '@holoscript/absorb-service/credits';

const mocks = vi.hoisted(() => ({
  requireCredits: vi.fn(
    async (_userId: string, _opType: string): Promise<Record<string, unknown>> => ({
      costCents: 100,
    })
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
  // A copy of the predicate at packages/absorb-service/src/credits/requireCredits.ts:87-89
  // (a credit error is any result carrying both `error` and `status`). The real module is
  // not loaded: it needs a built package and a database. If the real predicate changes,
  // this copy will not follow it.
  isCreditError: (result: Record<string, unknown>) => 'error' in result && 'status' in result,
}));

vi.mock('../daemon/jobs/store.js', () => ({
  listDaemonJobs: mocks.listDaemonJobs,
  getTelemetrySummary: mocks.getTelemetrySummary,
  createDaemonJob: mocks.createDaemonJob,
}));

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

// A uuid of digits only, and one with hex LETTERS: a predicate that accepted only digits,
// or only upper case, would still admit the first and refuse the second.
const USER = '11111111-2222-4333-8444-555555555555';
const LETTERED = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// The real prices (packages/absorb-service/src/credits/pricing.ts:13-15), one per profile, so a
// charge hard-coded to one profile's price, or to zero, fails for the other profiles.
const COST: Record<string, number> = { quick: 50, balanced: 100, deep: 250 };
const OP: Record<string, string> = {
  quick: 'daemon_quick',
  balanced: 'daemon_balanced',
  deep: 'daemon_deep',
};

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

// What can reach req.userId on this route: auth.ts assigns it in three places, a database
// user's uuid (:145, :179) and `orchestrator:<key>` (:169), or leaves it unset.
const PRODUCED: Array<[string, unknown]> = [
  ['unset (a service key whose token resolves to no user)', undefined],
  ['the MCPMe orchestrator id (orchestrator:<key>, auth.ts:169)', 'orchestrator:key-1'],
];
// No producer is left for these on this route; they stay so a regression that brings one
// back is refused too.
const NO_PRODUCER: Array<[string, unknown]> = [
  ['an empty string', ''],
  ['the legacy literal anonymous', 'anonymous'],
  ['a service principal string', 'service:absorb-api-key'],
];
// The edges of the uuid predicate (auth.ts:19, 31-34): each is refused, and each is what a
// looser predicate would admit (no ^, trimming, a length test, [0-9a-z], a moved hyphen).
const NEAR_UUIDS: Array<[string, unknown]> = [
  ['a uuid one character short', USER.slice(0, -1)],
  ['a uuid with trailing junk', `${USER}x`],
  ['a uuid with leading junk', `x${LETTERED}`],
  ['an orchestrator id that wraps a uuid', `orchestrator:${LETTERED}`],
  ['a uuid with a leading space', ` ${LETTERED}`],
  ['a uuid with a trailing space', `${LETTERED} `],
  ['the uuid shape with a letter that is not hex', 'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
  ['36 characters with a hyphen moved', 'a0eebc999-c0b-4ef8-bb6d-6bb9bd380a11'],
];
const REFUSED = [...PRODUCED, ...NO_PRODUCER, ...NEAR_UUIDS];

describe.each(['quick', 'balanced', 'deep', undefined] as Array<string | undefined>)(
  'POST /api/holodaemon start, profile=%s',
  (profile) => {
    const run = profile ?? 'balanced';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each(REFUSED)(
      'refuses %s: 403, and no ledger seam or job is touched',
      async (_label, id) => {
        const res = mockRes();
        await handle(startReq(profile, id), res as unknown as Response);
        expect(res._status).toBe(403);
        expect(res._json).toMatchObject({ error: 'User identity required' });
        expect(mocks.requireCredits).not.toHaveBeenCalled();
        expect(mocks.deductCredits).not.toHaveBeenCalled();
        expect(mocks.createDaemonJob).not.toHaveBeenCalled();
      }
    );

    it.each([
      ['a uuid of digits', USER],
      ['a uuid with hex letters', LETTERED],
    ])(
      "charges %s: that user, the profile's price, once, for one job that user owns",
      async (_label, user) => {
        mocks.requireCredits.mockResolvedValueOnce({ costCents: COST[run] });
        const res = mockRes();
        await handle(startReq(profile, user), res as unknown as Response);
        expect(res._status).toBe(201);
        expect(res._json).toMatchObject({ job: { id: 'job-1' }, cost: COST[run] });
        expect(mocks.requireCredits).toHaveBeenCalledTimes(1);
        expect(mocks.requireCredits).toHaveBeenCalledWith(user, OP[run]);
        expect(mocks.createDaemonJob).toHaveBeenCalledTimes(1);
        expect(mocks.createDaemonJob).toHaveBeenCalledWith(
          expect.objectContaining({ userId: user, profile: run })
        );
        expect(mocks.deductCredits).toHaveBeenCalledTimes(1);
        expect(mocks.deductCredits).toHaveBeenCalledWith(
          user,
          COST[run],
          `HoloDaemon cycle (${run})`,
          {
            jobId: 'job-1',
            profile: run,
          }
        );
      }
    );
  }
);

describe('POST /api/holodaemon start with too few credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers 402 with the credit error requireCredits returns, and starts and charges nothing', async () => {
    // The refusal requireCredits builds for a deep run with an empty account (requireCredits.ts:66-75).
    const creditError = {
      error: 'Insufficient credits',
      status: 402,
      required: 250,
      balance: 0,
      description: 'Deep improvement (3 cycles)',
      purchaseUrl: '/absorb?tab=credits',
    } satisfies CreditError;
    mocks.requireCredits.mockResolvedValueOnce(creditError);
    const res = mockRes();
    await handle(startReq('deep', USER), res as unknown as Response);
    expect(res._status).toBe(402);
    expect(res._json).toEqual(creditError);
    expect(mocks.createDaemonJob).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });
});
