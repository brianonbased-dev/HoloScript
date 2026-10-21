/**
 * /scan with repoUrl: absorb clones the repo itself. Charging and cleanup.
 * The clone is replaced by a stand-in (clone-from-url.test.ts covers the
 * guards); the ledger stands in the same way absorb.credits.test.ts does.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const h = vi.hoisted(() => ({
  balance: 1000,
  debits: [] as Array<{ userId: string; cents: number; meta: Record<string, unknown> }>,
  scanFails: false,
  cleanups: 0,
  clones: 0,
  cloneError: null as null | Error,
}));

vi.mock('@holoscript/absorb-service/credits', () => {
  const api = {
    requireCredits: vi.fn(async (userId: string) =>
      h.balance >= 10 ? { userId, costCents: 10, operationType: 'absorb_shallow' } : { error: 'Insufficient credits', status: 402 }
    ),
    deductCredits: vi.fn(async (userId: string, cents: number, _d: string, meta: Record<string, unknown>) => {
      if (h.balance < cents) return null;
      h.balance -= cents;
      h.debits.push({ userId, cents, meta });
      return { balanceCents: h.balance };
    }),
    isCreditError: (r: Record<string, unknown>) => 'error' in r && 'status' in r,
  };
  return { ...api, default: api };
});

vi.mock('@holoscript/absorb-service/engine', () => {
  const api = {
    absorbRootRefusal: () => 'path refusal must not be consulted for a URL import',
    CodebaseScanner: class {
      async scan() {
        if (h.scanFails) throw new Error('scanner blew up');
        return { files: [{ path: 'README.md', imports: [] }], stats: { durationMs: 1, totalFiles: 1 } };
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

vi.mock('../lib/absorb/clone-from-url.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/absorb/clone-from-url.js')>();
  return {
    ...actual,
    cloneRepo: vi.fn(async (url: unknown) => {
      actual.normalizeRepoUrl(url); // the real allowlist still runs
      h.clones += 1;
      if (h.cloneError) throw h.cloneError;
      return { dir: '/data/absorb-clones/c-test/repo', cleanup: async () => void (h.cleanups += 1) };
    }),
  };
});

const USER = '11111111-2222-4333-8444-555555555555';
type Handler = (req: Request, res: Response) => Promise<unknown>;
let scan: Handler;
let reset: () => void;

beforeAll(async () => {
  const mod = await import('./absorb.js');
  reset = mod.__resetImportsForTests;
  const stack = (mod.absorbRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> }).stack;
  const route = stack.find((l) => l.route?.path === '/scan' && l.route.methods.post)!.route!;
  scan = route.stack[route.stack.length - 1].handle;
}, 30_000);

beforeEach(async () => {
  h.balance = 1000;
  h.debits = [];
  h.scanFails = false;
  h.cleanups = 0;
  h.clones = 0;
  h.cloneError = null;
  reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { CloneRefusal } = await import('../lib/absorb/clone-from-url.js');
  void CloneRefusal;
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

const IMPORT = {
  repoUrl: 'https://github.com/owner/tiny',
  branch: 'main',
  importId: 'imp-0001-aaaa',
  projectId: 'ws-1',
  shallow: true,
};

describe('/scan repoUrl import', () => {
  it('scans the clone, charges once, and cleans the clone up', async () => {
    const r = await call(IMPORT);
    expect(r._status).toBe(200);
    expect(r._json?.cost).toBe(10);
    expect(h.debits).toHaveLength(1);
    expect(h.debits[0].meta.importId).toBe('imp-0001-aaaa');
    expect(h.cleanups).toBe(1);
  });

  it('a retry with the same importId is not charged again (and not re-cloned)', async () => {
    await call(IMPORT);
    const again = await call(IMPORT);
    expect(again._status).toBe(200);
    expect(again._json?.cost).toBe(0);
    expect(again._json?.replayed).toBe(true);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  });

  it('two concurrent requests with the same importId: one clone, one charge', async () => {
    const [a, b] = await Promise.all([call(IMPORT), call(IMPORT)]);
    expect([a._status, b._status]).toEqual([200, 200]);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  });

  it('a failed scan charges nothing, still cleans up, and can be retried', async () => {
    h.scanFails = true;
    const r = await call(IMPORT);
    expect(r._status).toBe(500);
    expect(h.debits).toHaveLength(0);
    expect(h.cleanups).toBe(1);
    h.scanFails = false;
    const retry = await call(IMPORT);
    expect(retry._status).toBe(200);
    expect(h.debits).toHaveLength(1);
  });

  it('a failed clone charges nothing (the clone removes its own dir)', async () => {
    const { CloneRefusal } = await import('../lib/absorb/clone-from-url.js');
    h.cloneError = new CloneRefusal('clone_timeout', 'too slow');
    const r = await call(IMPORT);
    expect(r._status).toBe(504);
    expect(r._json?.error).toBe('clone_timeout');
    expect(h.debits).toHaveLength(0);
  });

  it('a refused URL is 400 and charges nothing', async () => {
    const r = await call({ ...IMPORT, repoUrl: 'http://github.com/owner/tiny' });
    expect(r._status).toBe(400);
    expect(r._json?.error).toBe('repo_url_not_allowed');
    expect(h.debits).toHaveLength(0);
  });

  it('path and repoUrl together are refused', async () => {
    const r = await call({ ...IMPORT, path: '/data/x' });
    expect(r._status).toBe(400);
    expect(h.clones).toBe(0);
  });
});
