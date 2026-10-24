/**
 * POST /api/moltbook/semantic-dedup: a charge that does not land answers 402 and
 * delivers no result (no paid work delivered free; same contract as /query).
 * The ledger and the embedding engine are module seams here, as in holodaemon.test.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  requireCredits: vi.fn(async () => ({ costCents: 5 })),
  deductCredits: vi.fn(async (): Promise<{ balanceCents: number } | null> => ({ balanceCents: 95 })),
}));

vi.mock('@holoscript/absorb-service/credits', () => ({
  default: undefined,
  requireCredits: mocks.requireCredits,
  deductCredits: mocks.deductCredits,
  isCreditError: (r: Record<string, unknown>) => 'error' in r && 'status' in r,
}));
vi.mock('@holoscript/absorb-service/engine', () => ({
  default: undefined,
  EmbeddingIndex: class {
    add() {}
    async search() { return [{ score: 0.99, metadata: { text: 'past post' } }]; }
  },
}));
vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

const USER = '11111111-2222-4333-8444-555555555555';
type Handler = (req: Request, res: Response) => Promise<unknown>;
let handle: Handler;

beforeAll(async () => {
  const { moltbookRouter } = await import('./moltbook.js');
  const stack = (moltbookRouter as any).stack as Array<{ route?: any }>;
  const route = stack.find((l) => l.route?.path === '/semantic-dedup' && l.route.methods.post)?.route;
  if (!route) throw new Error('no post /semantic-dedup route');
  handle = route.stack[route.stack.length - 1].handle;
}, 30_000);

function call() {
  const res: any = { _status: 200, _json: null, headers: {} as Record<string, string>,
    status(c: number) { res._status = c; return res; },
    json(d: unknown) { res._json = d; return res; },
    setHeader(k: string, v: string) { res.headers[k] = v; return res; } };
  const req = { body: { concept: 'new post', history: ['past post'] }, headers: {}, query: {}, params: {}, userId: USER } as unknown as Request;
  return { req, res };
}

describe('POST /api/moltbook/semantic-dedup billing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a charge that lands: 200 with the result, charged once', async () => {
    const { req, res } = call();
    await handle(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ isDuplicate: true });
    expect(mocks.deductCredits).toHaveBeenCalledTimes(1);
  });

  it('a charge that does not land: 402 and no result delivered', async () => {
    mocks.deductCredits.mockResolvedValueOnce(null);
    const { req, res } = call();
    await handle(req, res);
    expect(res._status).toBe(402);
    expect(res._json).not.toHaveProperty('isDuplicate');
    expect(res._json).not.toHaveProperty('score');
    expect(res._json).not.toHaveProperty('matched');
  });
});
