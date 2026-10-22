/**
 * No free scans (CoS, #623). A folder scan that would not be charged is
 * refused before anything runs: a service/orchestrator key with no signed-in
 * account gets 401 account_required; a signed-in account without projectId
 * gets 400 project_required. Every scan that runs is charged.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const h = vi.hoisted(() => ({
  debits: [] as Array<{ meta: Record<string, unknown> }>,
  scans: 0,
  gate: null as null | Promise<void>,
}));

vi.mock('@holoscript/absorb-service/credits', () => {
  const api = {
    requireCredits: vi.fn(async (userId: string) => ({
      userId,
      costCents: 10,
      operationType: 'absorb_shallow',
    })),
    deductCredits: vi.fn(
      async (_u: string, _c: number, _d: string, meta: Record<string, unknown>) => {
        h.debits.push({ meta });
        return { balanceCents: 990 };
      }
    ),
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
        if (h.gate) await h.gate;
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

const USER = '11111111-2222-4333-8444-555555555555';
type Handler = (req: Request, res: Response) => Promise<unknown>;
let scan: Handler;
let reset: () => void;

beforeAll(async () => {
  const mod = await import('./absorb.js');
  reset = mod.__resetImportsForTests;
  const stack = (
    mod.absorbRouter as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: Handler }>;
        };
      }>;
    }
  ).stack;
  const route = stack.find((l) => l.route?.path === '/scan' && l.route.methods.post)!.route!;
  scan = route.stack[route.stack.length - 1].handle;
}, 30_000);

beforeEach(() => {
  h.debits = [];
  h.scans = 0;
  h.gate = null;
  reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function call(
  body: Record<string, unknown>,
  who: Record<string, unknown> = { authenticated: true, userId: USER }
) {
  const res = {
    _status: 200,
    _json: null as Record<string, unknown> | null,
    status(c: number) {
      res._status = c;
      return res;
    },
    json(d: Record<string, unknown>) {
      res._json = d;
      return res;
    },
  };
  await scan({ body, headers: {}, ...who } as unknown as Request, res as unknown as Response);
  return res;
}

const PATH = '/data/workspaces/ws-1/repo';

describe('/scan folder: no free paths', () => {
  it('service key only (no signed-in account): 401 account_required, nothing scanned or charged', async () => {
    for (const body of [
      { path: PATH },
      { path: PATH, projectId: 'ws-1', importId: 'imp-key-0001' },
    ]) {
      const r = await call(body, { authenticated: true });
      expect(r._status).toBe(401);
      expect(r._json?.error).toBe('account_required');
    }
    expect(h.scans).toBe(0);
    expect(h.debits).toHaveLength(0);
  });

  it('signed in without projectId: 400 project_required, nothing scanned or charged', async () => {
    const r = await call({ path: PATH, shallow: true });
    expect(r._status).toBe(400);
    expect(r._json?.error).toBe('project_required');
    expect(h.scans).toBe(0);
    expect(h.debits).toHaveLength(0);
  });

  it('no scan runs at cost 0: every request shape either refuses or charges', async () => {
    const shapes: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ path: PATH }, {}],
      [{ path: PATH }, { authenticated: true }],
      [{ path: PATH, projectId: 'ws-1' }, { authenticated: true }],
      [{ path: PATH }, { authenticated: true, userId: USER }],
      [
        { path: PATH, projectId: 'ws-1', shallow: true },
        { authenticated: true, userId: USER },
      ],
      [
        { path: '/data/workspaces/ws-2/repo', projectId: 'ws-2', importId: 'imp-nofree-0002' },
        { authenticated: true, userId: USER },
      ],
    ];
    for (const [body, who] of shapes) await call(body, who);
    expect(h.scans).toBeGreaterThan(0);
    expect(h.debits).toHaveLength(h.scans);
  });
});
