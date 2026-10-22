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
  // A shared database for the import claims (null: no database configured).
  db: null as unknown,
  // While set, a clone waits on it (to hold an import open on one instance).
  cloneGate: null as null | Promise<void>,
  // Claim and charge order, as the shared database and the ledger see them.
  order: [] as string[],
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
      h.order.push('debit');
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

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => h.db) }));

vi.mock('../lib/absorb/clone-from-url.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/absorb/clone-from-url.js')>();
  return {
    ...actual,
    cloneRepo: vi.fn(async (url: unknown) => {
      actual.normalizeRepoUrl(url); // the real allowlist still runs
      h.clones += 1;
      if (h.cloneGate) await h.cloneGate;
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
  h.db = null;
  h.cloneGate = null;
  h.order = [];
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

describe('/scan repoUrl import: importId is required', () => {
  it('repoUrl without importId is 400, with no clone and no charge', async () => {
    const { importId: _omit, ...noId } = IMPORT;
    void _omit;
    const r = await call(noId);
    expect(r._status).toBe(400);
    expect(JSON.stringify(r._json)).toContain('importId is required with repoUrl');
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  });
});

/**
 * Two absorb instances sharing one database. Each instance is a fresh import of
 * absorb.ts (its own in-memory state); only the claim table is shared, the way
 * Postgres is shared between replicas.
 */
function sharedDb(opts: { failClaim?: boolean; failComplete?: boolean } = {}) {
  const rows = new Map<
    string,
    { status: string; outcome: unknown; claimedAt: number; holder: string; repoUrl: unknown; branch: unknown }
  >();
  // The ledger is h.debits: a usage row for (user, importId) means "charged".
  const charged = (user: unknown, importId: unknown) =>
    h.debits.some((d) => d.userId === user && d.meta.importId === importId);
  const query = vi.fn(async (text: string, p: unknown[]) => {
    const key = `${p[0]}:${p[1]}`;
    if (text.startsWith('INSERT INTO absorb_import_claims')) {
      h.order.push('claim');
      if (opts.failClaim) throw new Error('db down');
      const row = rows.get(key);
      const takeover =
        row &&
        row.status === 'pending' &&
        Date.now() - row.claimedAt > Number(p[2]) &&
        row.repoUrl === p[4] &&
        row.branch === p[5] &&
        !charged(p[0], p[1]);
      if (!row || takeover) {
        rows.set(key, { status: 'pending', outcome: null, claimedAt: Date.now(), holder: String(p[3]), repoUrl: p[4], branch: p[5] });
        return { rows: [{ import_id: p[1] }] };
      }
      return { rows: [] };
    }
    if (text.startsWith('SELECT status, outcome, repo_url, branch')) {
      const row = rows.get(key);
      return {
        rows: row
          ? [{ status: row.status, outcome: row.outcome, repo_url: row.repoUrl, branch: row.branch, charged: charged(p[0], p[1]) }]
          : [],
      };
    }
    if (text.startsWith('UPDATE absorb_import_claims SET claimed_at')) {
      const row = rows.get(key);
      if (row && row.holder === p[2] && row.status === 'pending') {
        row.claimedAt = Date.now();
        return { rows: [{ import_id: p[1] }] };
      }
      return { rows: [] };
    }
    if (text.startsWith('UPDATE absorb_import_claims')) {
      if (opts.failComplete) throw new Error('db blip on complete');
      const row = rows.get(key);
      if (row && row.holder === p[2]) Object.assign(row, { status: 'done', outcome: JSON.parse(String(p[3])) });
      return { rows: [] };
    }
    if (text.startsWith('DELETE FROM absorb_import_claims')) {
      const row = rows.get(key);
      if (row?.status === 'pending' && row.holder === p[2]) rows.delete(key);
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${text}`);
  });
  return { rows, db: { $client: { query } } };
}
async function newInstance(): Promise<Handler> {
  vi.resetModules();
  const mod = await import('./absorb.js');
  const stack = (mod.absorbRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> }).stack;
  const route = stack.find((l) => l.route?.path === '/scan' && l.route.methods.post)!.route!;
  return route.stack[route.stack.length - 1].handle;
}

async function callOn(handler: Handler, body: Record<string, unknown>) {
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
  await handler(
    { body, authenticated: true, userId: USER, headers: {} } as unknown as Request,
    res as unknown as Response
  );
  return res;
}

describe('/scan repoUrl import across instances (shared database)', () => {
  it('a retry on another instance replays the first result: one clone, one charge', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    const b = await newInstance();
    const first = await callOn(a, IMPORT);
    expect(first._status).toBe(200);
    expect(first._json?.cost).toBe(10);
    const again = await callOn(b, IMPORT);
    expect(again._status).toBe(200);
    expect(again._json?.cost).toBe(0);
    expect(again._json?.replayed).toBe(true);
    expect(again._json?.graphId).toBe(first._json?.graphId);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
    expect(shared.rows.get(`${USER}:${IMPORT.importId}`)?.status).toBe('done');
  }, 30_000);

  it('the claim is taken before the charge', async () => {
    h.db = sharedDb().db;
    const a = await newInstance();
    await callOn(a, IMPORT);
    expect(h.order).toEqual(['claim', 'debit']);
  }, 30_000);

  it('while one instance is still importing, another answers 409 and charges nothing; its retry afterwards replays', async () => {
    h.db = sharedDb().db;
    const a = await newInstance();
    const b = await newInstance();
    let open!: () => void;
    h.cloneGate = new Promise<void>((resolve) => (open = resolve));
    const running = callOn(a, IMPORT);
    await vi.waitFor(() => expect(h.clones).toBe(1));
    const busy = await callOn(b, IMPORT);
    expect(busy._status).toBe(409);
    expect(busy._json?.error).toBe('import_in_progress');
    open();
    expect((await running)._status).toBe(200);
    const after = await callOn(b, IMPORT);
    expect(after._json?.replayed).toBe(true);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  }, 30_000);

  it('a failed import on one instance releases its claim; a retry on another is charged once', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    const b = await newInstance();
    h.scanFails = true;
    expect((await callOn(a, IMPORT))._status).toBe(500);
    expect(shared.rows.size).toBe(0);
    h.scanFails = false;
    const retry = await callOn(b, IMPORT);
    expect(retry._status).toBe(200);
    expect(retry._json?.cost).toBe(10);
    expect(h.debits).toHaveLength(1);
  }, 30_000);

  it('if the claim cannot be recorded, the import is refused (503) before any clone or charge', async () => {
    h.db = sharedDb({ failClaim: true }).db;
    const a = await newInstance();
    const r = await callOn(a, IMPORT);
    expect(r._status).toBe(503);
    expect(r._json?.error).toBe('import_guard_unavailable');
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  }, 30_000);
});

describe('/scan repoUrl import: stale takeover, late writes, reused importIds (Mapping, #617)', () => {
  const key = `${USER}:${IMPORT.importId}`;

  it('a takeover after the charge does not charge again', async () => {
    // Instance A charges, then fails to record "done": the claim stays pending.
    const shared = sharedDb({ failComplete: true });
    h.db = shared.db;
    const a = await newInstance();
    const b = await newInstance();
    expect((await callOn(a, IMPORT))._status).toBe(200);
    expect(h.debits).toHaveLength(1);
    expect(shared.rows.get(key)?.status).toBe('pending');
    shared.rows.get(key)!.claimedAt = 0; // long past PENDING_STALE_MS
    const again = await callOn(b, IMPORT);
    expect(again._status).toBe(409);
    expect(again._json?.error).toBe('import_already_charged');
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  }, 30_000);

  it('a late write from the old holder is ignored, and the old holder does not charge', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    const b = await newInstance();
    let open!: () => void;
    h.cloneGate = new Promise<void>((resolve) => (open = resolve));
    const slow = callOn(a, IMPORT); // A claims, then stalls in the clone
    await vi.waitFor(() => expect(h.clones).toBe(1));
    const oldHolder = shared.rows.get(key)!.holder;
    shared.rows.get(key)!.claimedAt = 0; // A looks dead
    h.cloneGate = null;
    const takeover = await callOn(b, IMPORT); // B takes over and finishes
    expect(takeover._status).toBe(200);
    expect(takeover._json?.cost).toBe(10);
    const newRow = { ...shared.rows.get(key)! };
    expect(newRow.holder).not.toBe(oldHolder);
    expect(newRow.status).toBe('done');
    open(); // A wakes up late
    const late = await slow;
    expect(late._status).toBe(409);
    expect(late._json?.error).toBe('import_claim_lost');
    expect(h.debits).toHaveLength(1); // A never charged
    expect(shared.rows.get(key)).toEqual(newRow); // A's late writes changed nothing
  }, 30_000);

  it('a reused importId with another branch or URL is refused (409) and charges nothing', async () => {
    h.db = sharedDb().db;
    const a = await newInstance();
    expect((await callOn(a, IMPORT))._status).toBe(200);
    const otherBranch = await callOn(a, { ...IMPORT, branch: 'dev' });
    expect(otherBranch._status).toBe(409);
    expect(otherBranch._json?.error).toBe('import_id_reused');
    const otherRepo = await callOn(a, { ...IMPORT, repoUrl: 'https://github.com/owner/other' });
    expect(otherRepo._status).toBe(409);
    expect(otherRepo._json?.error).toBe('import_id_reused');
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  }, 30_000);

  it('the same refusal holds with no database (in-memory claims)', async () => {
    expect((await call(IMPORT))._status).toBe(200);
    const r = await call({ ...IMPORT, branch: 'dev' });
    expect(r._status).toBe(409);
    expect(r._json?.error).toBe('import_id_reused');
    expect(h.debits).toHaveLength(1);
  });
});