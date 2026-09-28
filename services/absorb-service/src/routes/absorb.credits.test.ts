/**
 * A scan is delivered only when the charge actually lands.
 *
 * requireCredits looks at the balance and does not take the money. Two scans
 * can both pass that look before either charge lands. deductCredits is the
 * charge: it returns empty when the balance is no longer enough, and it does
 * not take the money. Until this fix the route ignored that empty result,
 * handed over the scan, and reported a cost that was never taken.
 *
 * The ledger behind those two calls is the production credits table. These
 * tests do not touch it. They stand in for the two seams, the way
 * holodaemon.test.ts does, and the stand-in follows the real rule: the look
 * does not take money, and the charge takes it only when the balance covers
 * the price.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const SHALLOW_CENTS = 10;

const ledger = vi.hoisted(() => {
  const state: {
    balance: number;
    byUser: Map<string, number>;
    debited: number;
    wentNegative: boolean;
    forceEmptyDebit: boolean;
    hold: null | (() => Promise<void>);
  } = {
    balance: 0,
    byUser: new Map(),
    debited: 0,
    wentNegative: false,
    forceEmptyDebit: false,
    hold: null,
  };

  function readBalance(userId: string): number {
    return state.byUser.has(userId) ? state.byUser.get(userId)! : state.balance;
  }

  function writeBalance(userId: string, next: number): void {
    if (state.byUser.has(userId)) state.byUser.set(userId, next);
    else state.balance = next;
    if (next < 0) state.wentNegative = true;
  }

  async function requireCreditsImpl(userId: string, opType: string) {
    const costCents = opType === 'absorb_shallow' ? SHALLOW_CENTS : opType === 'query_with_llm' ? 0 : 0;
    const balance = readBalance(userId);
    if (balance < costCents) {
      return {
        error: 'Insufficient credits',
        status: 402,
        required: costCents,
        balance,
      };
    }
    return { userId, costCents, operationType: opType };
  }

  const requireCredits = vi.fn(requireCreditsImpl);

  return {
    state,
    readBalance,
    restoreRequireCredits() {
      requireCredits.mockImplementation(requireCreditsImpl);
    },
    requireCredits,
    deductCredits: vi.fn(async (userId: string, cents: number) => {
      if (state.hold) await state.hold();
      if (state.forceEmptyDebit) return null;
      const balance = readBalance(userId);
      if (balance < cents) return null;
      const next = balance - cents;
      writeBalance(userId, next);
      state.debited += cents;
      return { balanceCents: next };
    }),
  };
});

vi.mock('@holoscript/absorb-service/credits', () => {
  // /scan reads `module.default || module`. A mock with no default throws
  // when that property is touched, and the scan never reaches the charge.
  const api = {
    requireCredits: ledger.requireCredits,
    deductCredits: ledger.deductCredits,
    isCreditError: (result: Record<string, unknown>) => 'error' in result && 'status' in result,
  };
  return { ...api, default: api };
});

vi.mock('@holoscript/absorb-service/engine', () => {
  const api = {
    CodebaseScanner: class {
      async scan() {
        return {
          files: [{ path: 'src/main.ts', imports: [] }],
          stats: { durationMs: 1, fileCount: 1 },
        };
      }
    },
    CodebaseGraph: class {
      buildFromScanResult() {}
      serialize() {
        return '{}';
      }
      getAllSymbols() {
        return [{ name: 'main' }];
      }
    },
    EmbeddingIndex: class {
      async addSymbols() {}
      async search() {
        return [
          {
            score: 0.9,
            metadata: {
              name: 'main',
              type: 'function',
              filePath: 'src/main.ts',
              documentation: 'starts the program',
            },
          },
        ];
      }
    },
    createEmbeddingProvider: async () => ({ name: 'structural' }),
  };
  return { ...api, default: api };
});

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

const USER = '11111111-2222-4333-8444-555555555555';
const USER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const PROJECT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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

let scan: Handler;
let query: Handler;

beforeAll(async () => {
  const { absorbRouter } = await import('./absorb.js');
  const stack = (absorbRouter as unknown as { stack: RouteLayer[] }).stack;
  const scanRoute = stack.find((layer) => layer.route?.path === '/scan' && layer.route.methods.post)?.route;
  const queryRoute = stack.find((layer) => layer.route?.path === '/query' && layer.route.methods.post)?.route;
  if (!scanRoute || !queryRoute) throw new Error('scan or query route is missing');
  scan = scanRoute.stack[scanRoute.stack.length - 1].handle;
  query = queryRoute.stack[queryRoute.stack.length - 1].handle;

  // Load the engine once, before two scans run together. A pair of first-time
  // imports racing each other can miss the mock and fail the scan before the
  // charge, which is not the race this file is about.
  const warmup = mockRes();
  await scan(
    { body: { path: '/repo/warmup', shallow: true } } as unknown as Request,
    warmup as unknown as Response
  );
  if (warmup._status !== 200) {
    throw new Error(`warmup scan failed: ${warmup._status} ${JSON.stringify(warmup._json)}`);
  }
}, 30_000);

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

function scanReq(path: string, userId: string = USER): Request {
  return {
    body: { path, shallow: true, projectId: PROJECT },
    authenticated: true,
    userId,
  } as unknown as Request;
}

beforeEach(() => {
  ledger.state.balance = 0;
  ledger.state.byUser.clear();
  ledger.state.debited = 0;
  ledger.state.wentNegative = false;
  ledger.state.forceEmptyDebit = false;
  ledger.state.hold = null;
  vi.clearAllMocks();
  ledger.restoreRequireCredits();
});

describe('POST /scan when two scans share a balance that covers one', () => {
  it('two concurrent scans with money for only one: exactly one is delivered and charged', async () => {
    ledger.state.balance = SHALLOW_CENTS;

    // Both scans must pass the balance look before either charge lands.
    // That is the gap the customer can fall through.
    let arrived = 0;
    let waiting: Array<() => void> = [];
    ledger.state.hold = () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('the other scan never reached the charge')), 3000);
        const go = () => {
          clearTimeout(timer);
          resolve();
        };
        arrived += 1;
        if (arrived >= 2) {
          const rest = waiting.splice(0);
          for (const release of rest) release();
          go();
        } else {
          waiting.push(go);
        }
      });

    const first = mockRes();
    const second = mockRes();
    await Promise.all([
      scan(scanReq('/repo/one'), first as unknown as Response),
      scan(scanReq('/repo/two'), second as unknown as Response),
    ]);

    const responses = [first, second];
    const delivered = responses.filter((res) => res._status === 200);
    const refused = responses.filter((res) => res._status === 402);
    const summary = responses.map((res) => ({ status: res._status, body: res._json }));

    // Both scans got past the balance look and into the charge. A refusal
    // from the look alone would not call the charge, and would miss the bug.
    expect(ledger.requireCredits, JSON.stringify(summary)).toHaveBeenCalledTimes(2);
    expect(ledger.deductCredits, JSON.stringify(summary)).toHaveBeenCalledTimes(2);
    expect(delivered, JSON.stringify(summary)).toHaveLength(1);
    expect(refused, JSON.stringify(summary)).toHaveLength(1);
    expect(delivered[0]._json).toMatchObject({
      cost: SHALLOW_CENTS,
      cached: false,
    });
    expect(typeof delivered[0]._json?.graphId).toBe('string');
    expect(refused[0]._json).toEqual({ error: 'Not enough credits for this scan.' });
    expect(refused[0]._json).not.toHaveProperty('cost');
    expect(refused[0]._json).not.toHaveProperty('graphId');

    const reportedCost = responses.reduce((sum, res) => {
      const cost = res._json?.cost;
      return sum + (typeof cost === 'number' ? cost : 0);
    }, 0);
    expect(reportedCost).toBe(ledger.state.debited);
    expect(ledger.state.debited).toBe(SHALLOW_CENTS);
    expect(ledger.state.balance).toBe(0);
    expect(ledger.state.wentNegative).toBe(false);
    expect(ledger.state.balance).toBeGreaterThanOrEqual(0);
  });
});

describe('POST /scan saved result is only for the account that paid', () => {
  it('a caller with no credits does not receive another caller\'s saved scan', async () => {
    const path = '/repo/paid-by-a';
    ledger.state.byUser.set(USER, SHALLOW_CENTS);
    ledger.state.byUser.set(USER_B, 0);
    // B is allowed past the balance look so the empty charge is what
    // refuses them. The saved scan must not skip that charge.
    ledger.requireCredits.mockImplementation(async (userId: string, opType: string) => ({
      userId,
      costCents: opType === 'absorb_shallow' ? SHALLOW_CENTS : 0,
      operationType: opType,
    }));

    const paid = mockRes();
    await scan(scanReq(path, USER), paid as unknown as Response);
    expect(paid._status).toBe(200);
    expect(paid._json).toMatchObject({ cost: SHALLOW_CENTS, cached: false });
    const paidGraph = paid._json?.graphId;
    expect(typeof paidGraph).toBe('string');

    const refused = mockRes();
    await scan(scanReq(path, USER_B), refused as unknown as Response);
    expect(refused._status).toBe(402);
    expect(refused._json).toEqual({ error: 'Not enough credits for this scan.' });
    expect(refused._json).not.toHaveProperty('cost');
    expect(refused._json).not.toHaveProperty('graphId');
    expect(refused._json).not.toEqual(expect.objectContaining({ graphId: paidGraph }));
    expect(ledger.readBalance(USER_B)).toBe(0);
    expect(ledger.state.debited).toBe(SHALLOW_CENTS);
  });

  it('the caller who paid can repeat that scan within 5 minutes and is not charged again', async () => {
    const path = '/repo/repeat-paid';
    ledger.state.byUser.set(USER, SHALLOW_CENTS);

    const first = mockRes();
    await scan(scanReq(path, USER), first as unknown as Response);
    expect(first._status).toBe(200);
    expect(first._json).toMatchObject({ cost: SHALLOW_CENTS, cached: false });

    const again = mockRes();
    await scan(scanReq(path, USER), again as unknown as Response);
    expect(again._status).toBe(200);
    expect(again._json).toMatchObject({
      graphId: first._json?.graphId,
      cost: 0,
      cached: true,
    });
    expect(ledger.deductCredits).toHaveBeenCalledTimes(1);
    expect(ledger.state.debited).toBe(SHALLOW_CENTS);
    expect(ledger.readBalance(USER)).toBe(0);
  });

  it('a caller with no account is not given a scan someone else paid for', async () => {
    const path = '/repo/not-for-strangers';
    ledger.state.byUser.set(USER, SHALLOW_CENTS);

    const paid = mockRes();
    await scan(scanReq(path, USER), paid as unknown as Response);
    expect(paid._status).toBe(200);
    const paidGraph = paid._json?.graphId;

    const stranger = mockRes();
    await scan(
      { body: { path, shallow: true } } as unknown as Request,
      stranger as unknown as Response
    );
    expect(stranger._status).toBe(200);
    expect(stranger._json).toMatchObject({ cost: 0, cached: false });
    expect(stranger._json?.graphId).not.toBe(paidGraph);
    expect(ledger.deductCredits).toHaveBeenCalledTimes(1);
  });
});

describe('POST /query when the charge comes back empty', () => {
  it('a query whose charge comes back empty is refused and reports no cost', async () => {
    const seeded = mockRes();
    await scan(
      {
        body: { path: '/repo/already-scanned', shallow: true },
      } as unknown as Request,
      seeded as unknown as Response
    );
    expect(seeded._status).toBe(200);
    const graphId = seeded._json?.graphId;
    expect(typeof graphId).toBe('string');
    expect(ledger.state.debited).toBe(0);

    ledger.state.balance = 0;
    ledger.state.forceEmptyDebit = true;

    const res = mockRes();
    await query(
      {
        body: { graphId, query: 'where is main', maxResults: 5 },
        authenticated: true,
        userId: USER,
      } as unknown as Request,
      res as unknown as Response
    );

    expect(ledger.requireCredits).toHaveBeenCalledWith(USER, 'query_with_llm');
    expect(ledger.deductCredits).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(402);
    expect(res._json).toEqual({ error: 'Not enough credits for this query.' });
    expect(res._json).not.toHaveProperty('cost');
    expect(res._json).not.toHaveProperty('results');
    expect(ledger.state.debited).toBe(0);
    expect(ledger.state.balance).toBe(0);
    expect(ledger.state.wentNegative).toBe(false);
  });
});
