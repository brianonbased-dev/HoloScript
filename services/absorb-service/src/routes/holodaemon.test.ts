/**
 * A daemon run is charged to a signed-in user, never to 'anonymous'.
 *
 * task_1790064120726_h0yq: POST /api/holodaemon {action:'start'} charged
 * `authReq.userId || 'anonymous'`. creditAccounts.userId is a uuid column, so the
 * literal threw "invalid input syntax for type uuid" and the route answered 500
 * to any caller whose token did not resolve to a user (a service key). The same
 * fault was fixed at four sites in credits.ts and survived here.
 *
 * Test shape, ruled under /founder (test strategy is agent-decided; the corpus
 * says "mock DB: no, real DB" and "anything with I/O hits prod"): the only real
 * ledger is the production credits table, and a unit test must not charge it,
 * so this file observes the two module seams the route crosses (the credits
 * module and the daemon job store), exactly as credits.test.ts and admin.test.ts
 * do. Named limitation: it proves the route's contract (a 403 before any credit
 * call; the uuid reaches the ledger calls), not Postgres's uuid cast. The cast
 * fault is pinned by the credits.ts history this fix copies, and the live proof
 * is the deployed route answering 403, not 500, to a service key.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  requireCredits: vi.fn(async (_userId: string, _opType: string) => ({ ok: true, costCents: 100 })),
  deductCredits: vi.fn(async (_userId: string, _cents: number, _why: string, _meta?: unknown) => ({ balanceCents: 900 })),
  isCreditError: vi.fn((check: { ok?: boolean }) => check.ok === false),
  createDaemonJob: vi.fn((_input: Record<string, unknown>) => ({ id: 'job-1', status: 'queued' })),
  listDaemonJobs: vi.fn(() => []),
  getTelemetrySummary: vi.fn(() => ({})),
}));

vi.mock('@holoscript/absorb-service/credits', () => ({
  requireCredits: mocks.requireCredits,
  deductCredits: mocks.deductCredits,
  isCreditError: mocks.isCreditError,
}));

vi.mock('../daemon/jobs/store.js', () => ({
  listDaemonJobs: mocks.listDaemonJobs,
  getTelemetrySummary: mocks.getTelemetrySummary,
  createDaemonJob: mocks.createDaemonJob,
}));

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

async function startHandler(): Promise<Handler> {
  const { holodaemonRouter } = await import('./holodaemon.js');
  const stack = (holodaemonRouter as unknown as { stack: RouteLayer[] }).stack;
  const route = stack.find((l) => l.route?.path === '/' && l.route.methods.post)?.route;
  if (!route) throw new Error('no post / route');
  return route.stack[route.stack.length - 1].handle;
}

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return { body: { action: 'start', profile: 'quick' }, query: {}, headers: {}, params: {}, ...overrides } as unknown as Request;
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

describe('POST /api/holodaemon start charges a signed-in user only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a caller with no user identity with 403 and never touches credits or the job store', async () => {
    const handle = await startHandler();
    const res = mockRes();
    await handle(mockReq(), res as unknown as Response);
    expect(res._status).toBe(403);
    expect(res._json).toMatchObject({ error: 'User identity required' });
    expect(mocks.requireCredits).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createDaemonJob).not.toHaveBeenCalled();
  });

  it('refuses the literal anonymous identity the same way (it is not a uuid)', async () => {
    const handle = await startHandler();
    const res = mockRes();
    await handle(mockReq({ userId: 'anonymous' }), res as unknown as Response);
    expect(res._status).toBe(403);
    expect(mocks.requireCredits).not.toHaveBeenCalled();
    expect(mocks.createDaemonJob).not.toHaveBeenCalled();
  });

  it('charges a uuid user: requireCredits and deductCredits see the uuid, the job carries it, 201', async () => {
    const handle = await startHandler();
    const res = mockRes();
    await handle(mockReq({ userId: USER }), res as unknown as Response);
    expect(res._status).toBe(201);
    expect(mocks.requireCredits).toHaveBeenCalledWith(USER, 'daemon_quick');
    expect(mocks.createDaemonJob).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, profile: 'quick' }));
    expect(mocks.deductCredits.mock.calls[0][0]).toBe(USER);
    expect(mocks.deductCredits.mock.calls[0][1]).toBe(100);
    expect(res._json).toMatchObject({ cost: 100 });
  });

  it('answers 402, not 500, when the user has no credits', async () => {
    mocks.requireCredits.mockResolvedValueOnce({ ok: false, costCents: 100 } as never);
    const handle = await startHandler();
    const res = mockRes();
    await handle(mockReq({ userId: USER }), res as unknown as Response);
    expect(res._status).toBe(402);
    expect(mocks.createDaemonJob).not.toHaveBeenCalled();
  });
});