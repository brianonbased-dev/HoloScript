/**
 * #617 follow-up: a charged FOLDER scan that carries an importId is charged at
 * most once per (account, importId), like a URL import. Studio's
 * /api/absorb/projects/[id]/absorb sends one, so a retry or a double click
 * cannot charge twice.
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
    requireCredits: vi.fn(async (userId: string) => ({ userId, costCents: 10, operationType: 'absorb_shallow' })),
    deductCredits: vi.fn(async (_u: string, _c: number, _d: string, meta: Record<string, unknown>) => {
      h.debits.push({ meta });
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
  const stack = (mod.absorbRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>;
  }).stack;
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

async function call(body: Record<string, unknown>) {
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
  await scan(
    { body, authenticated: true, userId: USER, headers: {} } as unknown as Request,
    res as unknown as Response
  );
  return res;
}

const FOLDER = { path: '/data/workspaces/ws-1/repo', projectId: 'ws-1', importId: 'imp-path-0001', shallow: true };

describe('/scan folder scan with importId', () => {
  it('two concurrent requests with the same importId: one scan, one charge', async () => {
    let open!: () => void;
    h.gate = new Promise<void>((r) => (open = r));
    const a = call(FOLDER);
    const b = call(FOLDER);
    await new Promise((r) => setTimeout(r, 20));
    open();
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra._status, rb._status]).toEqual([200, 200]);
    expect(h.debits).toHaveLength(1);
    expect(h.debits[0].meta.importId).toBe('imp-path-0001');
    expect(h.scans).toBe(1);
  });

  it('an importId reused for another folder is refused (409 import_id_reused), no charge', async () => {
    await call(FOLDER);
    const r = await call({ ...FOLDER, path: '/data/workspaces/ws-2/repo' });
    expect(r._status).toBe(409);
    expect(r._json?.error).toBe('import_id_reused');
    expect(h.debits).toHaveLength(1);
  });

  it('a different importId is a new, charged scan', async () => {
    await call(FOLDER);
    await call({ ...FOLDER, importId: 'imp-path-0002', shallow: false });
    expect(h.debits).toHaveLength(2);
  });
});