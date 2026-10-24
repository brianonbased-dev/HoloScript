/**
 * /scan with repoUrl: absorb clones the repo itself. Charging and cleanup.
 * The clone is replaced by a stand-in (clone-from-url.test.ts covers the
 * guards); the ledger stands in the same way absorb.credits.test.ts does.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAIM_HEARTBEAT_MS, PENDING_STALE_MS, commitImportId } from '../lib/absorb/importClaims.js';
import { CLONE_TIMEOUT_MS, normalizeRepoUrl } from '../lib/absorb/clone-from-url.js';
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
  // Throw right after the ledger row lands (Mapping H1: exception after the debit).
  throwAfterDebit: false,
  // Runs at the start of deductCredits, after the route's own confirm (CoS: a
  // stall between the holder check and the debit).
  beforeDebit: null as null | (() => void),
  // The commit each repo URL resolves to (git ls-remote stand-in).
  shas: new Map<string, string>(),
  resolves: 0,
}));

vi.mock('@holoscript/absorb-service/credits', () => {
  const api = {
    requireCredits: vi.fn(async (userId: string) =>
      h.balance >= 10 ? { userId, costCents: 10, operationType: 'absorb_shallow' } : { error: 'Insufficient credits', status: 402, balance: h.balance }
    ),
    deductCredits: vi.fn(async (
      userId: string,
      cents: number,
      _d: string,
      meta: Record<string, unknown>,
      opts?: { guard?: (tx: unknown) => Promise<boolean> }
    ) => {
      h.beforeDebit?.();
      if (opts?.guard) {
        // The real deductCredits runs the guard on its transaction's client;
        // here that client is the shared database's query, fed the same SQL.
        const { PgDialect } = await import('drizzle-orm/pg-core');
        const dialect = new PgDialect();
        const client = (h.db as { $client: { query: (t: string, p: unknown[]) => Promise<{ rows: unknown[] }> } } | null)?.$client;
        const tx = {
          execute: async (q: unknown) => {
            const { sql, params } = dialect.sqlToQuery(q as never);
            return client!.query(sql, params);
          },
        };
        if (!(await opts.guard(tx))) throw Object.assign(new Error('guard refused'), { code: 'charge_guard_refused' });
      }
      if (h.balance < cents && !(opts as { allowOverdraft?: boolean } | undefined)?.allowOverdraft) return null;
      h.balance -= cents;
      h.debits.push({ userId, cents, meta });
      h.order.push('debit');
      if (h.throwAfterDebit) throw new Error('connection reset after the debit');
      return { balanceCents: h.balance };
    }),
    isCreditError: (r: Record<string, unknown>) => 'error' in r && 'status' in r,
    CHARGE_GUARD_REFUSED: 'charge_guard_refused',
    OPERATION_COSTS: { absorb_shallow: { baseCostCents: 10 }, absorb_deep: { baseCostCents: 50 } },
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
    resolveCommitSha: vi.fn(async (url: unknown) => {
      const u = actual.normalizeRepoUrl(url);
      h.resolves += 1;
      return h.shas.get(u) ?? 'a'.repeat(40);
    }),
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
let dropGraphs: () => void;

beforeAll(async () => {
  const mod = await import('./absorb.js');
  reset = mod.__resetImportsForTests;
  dropGraphs = mod.__dropGraphsForTests;
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
  h.throwAfterDebit = false;
  h.beforeDebit = null;
  h.shas = new Map();
  h.resolves = 0;
  reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { CloneRefusal } = await import('../lib/absorb/clone-from-url.js');
  void CloneRefusal;
});

async function call(body: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const res = {
    _status: 200,
    _json: null as Record<string, unknown> | null,
    _headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      res._headers[k] = v;
      return res;
    },
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
    { body, authenticated: true, userId: USER, headers: {}, ...extra } as unknown as Request,
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

/** The server-side claim key for IMPORT: user + repo + commit (#617). */
const KEY_ID = commitImportId(normalizeRepoUrl('https://github.com/owner/tiny'), 'a'.repeat(40), { shallow: true });

describe('/scan repoUrl import', () => {
  it('scans the clone, charges once, and cleans the clone up', async () => {
    const r = await call(IMPORT);
    expect(r._status).toBe(200);
    expect(r._json?.cost).toBe(10);
    expect(h.debits).toHaveLength(1);
    expect(h.debits[0].meta.importId).toBe(KEY_ID);
    expect(h.debits[0].meta.clientImportId).toBe('imp-0001-aaaa');
    expect(h.debits[0].meta.commitSha).toBe('a'.repeat(40));
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
      // The fake follows the SQL it is sent: a fresh insert is ledger-gated
      // only when the statement itself says so (WHERE NOT EXISTS before ON CONFLICT).
      const insertGated = /WHERE NOT EXISTS[\s\S]*ON CONFLICT/.test(text);
      if (!row && insertGated && charged(p[0], p[1])) return { rows: [] };
      if (!row || takeover) {
        rows.set(key, { status: 'pending', outcome: null, claimedAt: Date.now(), holder: String(p[3]), repoUrl: p[4], branch: p[5] });
        return { rows: [{ import_id: p[1] }] };
      }
      return { rows: [] };
    }
    if (text.startsWith('SELECT EXISTS')) {
      return { rows: [{ charged: charged(p[0], p[1]) }] };
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
      const deleteGated = text.includes('credit_transactions');
      if (row?.status === 'pending' && row.holder === p[2] && !(deleteGated && charged(p[0], p[1]))) rows.delete(key);
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

async function callOn(handler: Handler, body: Record<string, unknown>, extra: Record<string, unknown> = {}) {
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
    { body, authenticated: true, userId: USER, headers: {}, ...extra } as unknown as Request,
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
    expect(h.clones).toBe(2); // the other instance has no graph in memory: rescanned free (#617 H1), never a dead graphId
    expect(shared.rows.get(`${USER}:${KEY_ID}`)?.status).toBe('done');
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
    expect(h.clones).toBe(2); // the other instance has no graph in memory: rescanned free (#617 H1), never a dead graphId
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
  const key = `${USER}:${KEY_ID}`;

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

  it('the claim is keyed on the commit: a reused client importId for another repo is a separate import, another branch at the same commit replays', async () => {
    h.db = sharedDb().db;
    const a = await newInstance();
    expect((await callOn(a, IMPORT))._status).toBe(200);
    const sameCommit = await callOn(a, { ...IMPORT, branch: 'dev' });
    expect(sameCommit._status).toBe(200);
    expect(sameCommit._json?.replayed).toBe(true);
    expect(sameCommit._json?.costCents).toBe(0);
    h.shas.set(normalizeRepoUrl('https://github.com/owner/other'), 'b'.repeat(40));
    const otherRepo = await callOn(a, { ...IMPORT, repoUrl: 'https://github.com/owner/other' });
    expect(otherRepo._status).toBe(200);
    expect(otherRepo._json?.costCents).toBe(10);
    expect(h.debits).toHaveLength(2);
    expect(h.clones).toBe(2);
  }, 30_000);

  it('the same commit key holds with no database (in-memory claims)', async () => {
    expect((await call(IMPORT))._status).toBe(200);
    const r = await call({ ...IMPORT, branch: 'dev' });
    expect(r._status).toBe(200);
    expect(r._json?.replayed).toBe(true);
    expect(h.debits).toHaveLength(1);
  });

  it('the clone is pinned to the resolved SHA; a pin mismatch is 502 and charges nothing', async () => {
    const mod = await import('../lib/absorb/clone-from-url.js');
    const cloneMock = mod.cloneRepo as unknown as { mock: { calls: unknown[][] } };
    const before = cloneMock.mock.calls.length;
    expect((await call(IMPORT))._status).toBe(200);
    expect(cloneMock.mock.calls[before][2]).toEqual({ expectedSha: 'a'.repeat(40) });

    h.shas.set(normalizeRepoUrl('https://github.com/owner/tiny'), 'c'.repeat(40));
    h.cloneError = new mod.CloneRefusal('clone_commit_mismatch', 'clone is at aaaa, expected cccc');
    const r = await call({ ...IMPORT, importId: 'imp-pin-mismatch' });
    expect(r._status).toBe(502);
    expect(r._json?.error).toBe('clone_commit_mismatch');
    expect(h.debits).toHaveLength(1); // only the first, pinned scan
  });
});

describe('/scan repoUrl import: exception after the charge (Mapping H1, #617)', () => {
  const key = `${USER}:${KEY_ID}`;

  it('an exception after the debit keeps the claim; the retry is not charged again (409)', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    const b = await newInstance();
    h.throwAfterDebit = true;
    const first = await callOn(a, IMPORT);
    expect(first._status).toBe(500);
    expect(h.debits).toHaveLength(1);
    expect(shared.rows.has(key)).toBe(true); // release refused: the ledger shows the charge
    h.throwAfterDebit = false;
    const retry = await callOn(b, IMPORT);
    expect(retry._status).toBe(409);
    expect(retry._json?.error).toBe('import_already_charged');
    expect(h.debits).toHaveLength(1);
  }, 30_000);

  it('a fresh claim for an import the ledger already charged is refused (409), not charged', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    expect((await callOn(a, IMPORT))._status).toBe(200);
    shared.rows.clear(); // the claim row is gone (e.g. lost), the ledger row is not
    const b = await newInstance();
    const again = await callOn(b, IMPORT);
    expect(again._status).toBe(409);
    expect(again._json?.error).toBe('import_already_charged');
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  }, 30_000);
});
describe('/scan repoUrl import: heartbeat while cloning and scanning (Mapping, #617)', () => {
  const key = `${USER}:${KEY_ID}`;
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(60_000);
  };
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 1000 && !ok(); i++) await new Promise((r) => setImmediate(r));
    expect(ok()).toBe(true);
  };
  afterEach(() => vi.useRealTimers());

  it('a takeover during a long clone is refused while the holder heartbeats', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    const b = await newInstance();
    let open!: () => void;
    h.cloneGate = new Promise<void>((resolve) => (open = resolve));
    const slow = callOn(a, IMPORT); // A claims and is still cloning
    await until(() => h.clones === 1);
    const holderA = shared.rows.get(key)!.holder;
    await ticks(20); // 20 minutes of cloning, past PENDING_STALE_MS (15 min)
    expect(Date.now() - shared.rows.get(key)!.claimedAt).toBeLessThan(PENDING_STALE_MS);
    const takeover = await callOn(b, IMPORT);
    expect(takeover._status).toBe(409);
    expect(takeover._json?.error).toBe('import_in_progress');
    expect(shared.rows.get(key)!.holder).toBe(holderA);
    open();
    const done = await slow;
    expect(done._status).toBe(200);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(1);
  }, 30_000);

  it('after the holder dies (no heartbeat), a takeover is allowed and sees the ledger', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const shared = sharedDb();
    h.db = shared.db;
    const b = await newInstance();
    // A died mid-import: its pending claim stopped refreshing.
    shared.rows.set(key, {
      status: 'pending', outcome: null, claimedAt: Date.now(), holder: 'dead-holder',
      repoUrl: normalizeRepoUrl(IMPORT.repoUrl), branch: null, // commit-keyed claim (#617)
    });
    await ticks(16);
    const taken = await callOn(b, IMPORT);
    expect(taken._status).toBe(200);
    expect(shared.rows.get(key)!.holder).not.toBe('dead-holder');
    expect(h.debits).toHaveLength(1);
  }, 30_000);

  it('after the holder dies having charged, the takeover sees the ledger and does not charge again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const shared = sharedDb();
    h.db = shared.db;
    const b = await newInstance();
    shared.rows.set(key, {
      status: 'pending', outcome: null, claimedAt: Date.now(), holder: 'dead-holder',
      repoUrl: normalizeRepoUrl(IMPORT.repoUrl), branch: null, // commit-keyed claim (#617)
    });
    h.debits.push({ userId: USER, cents: 10, meta: { graphId: 'g-dead', shallow: true, importId: KEY_ID } });
    await ticks(16);
    const taken = await callOn(b, IMPORT);
    expect(taken._status).toBe(409);
    expect(taken._json?.error).toBe('import_already_charged');
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(0);
  }, 30_000);

  it('the stale cutoff outlasts the clone cap and many heartbeats', () => {
    expect(PENDING_STALE_MS).toBeGreaterThan(CLONE_TIMEOUT_MS + 5 * CLAIM_HEARTBEAT_MS);
  });
});
describe('/scan repoUrl import: holder check and debit in one transaction (CoS, #617)', () => {
  const key = `${USER}:${KEY_ID}`;

  it('the holder is replaced between its confirm and the debit: it does not charge, one debit total', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    // A has passed its own confirm; then it stalls (GC, event loop, DB wait)
    // past PENDING_STALE_MS, B takes the claim over and charges.
    h.beforeDebit = () => {
      h.beforeDebit = null;
      const row = shared.rows.get(key)!;
      row.holder = 'holder-b';
      h.debits.push({ userId: USER, cents: 10, meta: { graphId: 'g-b', shallow: true, importId: KEY_ID } });
    };
    const late = await callOn(a, IMPORT);
    expect(late._status).toBe(409);
    expect(late._json?.error).toBe('import_claim_lost');
    expect(h.debits).toHaveLength(1); // B's only
    expect(h.debits[0].meta.graphId).toBe('g-b');
    expect(shared.rows.get(key)!.holder).toBe('holder-b');
  }, 30_000);

  it('a holder that keeps its claim is charged once, through the guarded transaction', async () => {
    const shared = sharedDb();
    h.db = shared.db;
    const a = await newInstance();
    expect((await callOn(a, IMPORT))._status).toBe(200);
    expect(h.debits).toHaveLength(1);
    const confirms = shared.db.$client.query.mock.calls.filter(([s]) => String(s).startsWith('UPDATE absorb_import_claims SET claimed_at'));
    expect(confirms.length).toBeGreaterThanOrEqual(2); // the route's confirm and the in-transaction guard
  }, 30_000);
});

describe('/scan repoUrl import: production needs a database; cost is labeled cents (Treasurer, #617)', () => {
  it('NODE_ENV=production with no DATABASE_URL: 503 before any clone, never the memory store', async () => {
    const saved = { env: process.env.NODE_ENV, url: process.env.DATABASE_URL };
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    try {
      const r = await call(IMPORT);
      expect(r._status).toBe(503);
      expect(r._json?.error).toBe('import_guard_unavailable');
      expect(h.clones).toBe(0);
      expect(h.debits).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = saved.env;
      if (saved.url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved.url;
    }
  });

  it('databaseRequiredRefusal: refuses only production without DATABASE_URL', async () => {
    const { databaseRequiredRefusal } = await import('../lib/absorb/importClaims.js');
    expect(databaseRequiredRefusal({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toMatch(/DATABASE_URL is required/);
    expect(databaseRequiredRefusal({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv)).toBeNull();
    expect(databaseRequiredRefusal({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeNull();
  });

  it('a charged import reports costCents next to cost; a replay reports costCents 0', async () => {
    const first = await call(IMPORT);
    expect(first._status).toBe(200);
    expect(first._json?.cost).toBe(10);
    expect(first._json?.costCents).toBe(10);
    const again = await call(IMPORT);
    expect(again._json?.costCents).toBe(0);
  });
});

/**
 * Mapping N2 (#617): the charge was gated on projectId, so a URL scan without
 * one ran free. It is charged by user now; with no account it is refused.
 */
describe('/scan repoUrl import: never free (Mapping N2)', () => {
  const { projectId: _p, ...NO_PROJECT } = IMPORT;
  void _p;

  it('a URL scan without projectId is charged once (and a retry replays free)', async () => {
    const r = await call(NO_PROJECT);
    expect(r._status).toBe(200);
    expect(r._json?.costCents).toBe(10);
    expect(h.debits).toHaveLength(1);
    expect(h.debits[0].userId).toBe(USER);
    const again = await call(NO_PROJECT);
    expect(again._json?.costCents).toBe(0);
    expect(h.debits).toHaveLength(1);
  });

  it('a URL scan with no account is refused (401) before any clone, never run free', async () => {
    for (const who of [
      { authenticated: false },
      { authenticated: true }, // account-unknown (legacy orchestrator attestation)
      { authenticated: true, userId: 'orchestrator:key' },
    ]) {
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
      await scan({ body: NO_PROJECT, headers: {}, ...who } as unknown as Request, res as unknown as Response);
      expect(res._status).toBe(401);
      expect(res._json?.error).toBe('account_required');
    }
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  });
});

/**
 * CoS/Treasurer (#617): a reload after a 502 makes a new workspace, so the
 * client sends a NEW importId for the same repo and commit. The server keys
 * the import on user + repo + commit SHA and returns the first import.
 */
describe('/scan repoUrl import: idempotent on user + repo + commit SHA', () => {
  it('a repeat request for the same commit with a new client importId returns the same import and charges once', async () => {
    h.db = sharedDb().db;
    const a = await newInstance();
    const b = await newInstance();
    const first = await callOn(a, IMPORT);
    expect(first._status).toBe(200);
    expect(first._json?.costCents).toBe(10);
    const afterReload = await callOn(b, { ...IMPORT, importId: 'imp-reload-after-502' });
    expect(afterReload._status).toBe(200);
    expect(afterReload._json?.graphId).toBe(first._json?.graphId);
    expect(afterReload._json?.replayed).toBe(true);
    expect(afterReload._json?.costCents).toBe(0);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(2); // the other instance has no graph in memory: rescanned free (#617 H1), never a dead graphId
  }, 30_000);

  it('a new commit on the same repo is a new import and is charged', async () => {
    expect((await call(IMPORT))._status).toBe(200);
    h.shas.set(normalizeRepoUrl('https://github.com/owner/tiny'), 'c'.repeat(40));
    const next = await call({ ...IMPORT, importId: 'imp-0002-bbbb' });
    expect(next._status).toBe(200);
    expect(next._json?.costCents).toBe(10);
    expect(h.debits).toHaveLength(2);
  });

  it('the commit cannot be resolved: refused before any claim, clone or charge', async () => {
    const mod = await import('../lib/absorb/clone-from-url.js');
    (mod.resolveCommitSha as unknown as { mockRejectedValueOnce: (e: unknown) => void }).mockRejectedValueOnce(
      new mod.CloneRefusal('clone_failed', 'branch not found on the remote')
    );
    const r = await call(IMPORT);
    expect(r._status).toBe(502);
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  });
});

describe('/scan repoUrl import: Mapping hold fixes (#617 H1, N3, N4)', () => {
  it('H1: after a restart the replayed graphId is rescanned under the same id, free, with no new debit', async () => {
    const first = await call(IMPORT);
    expect(first._status).toBe(200);
    expect(h.debits).toHaveLength(1);
    dropGraphs(); // a restart: claims survive, in-memory graphs do not
    const again = await call(IMPORT);
    expect(again._status).toBe(200);
    expect(again._json?.graphId).toBe(first._json?.graphId);
    expect(again._json?.cost).toBe(0);
    expect(again._json?.replayed).toBe(true);
    expect(again._json?.rehydrated).toBe(true);
    expect(h.debits).toHaveLength(1);
    expect(h.clones).toBe(2);
    // The graph is live again: the next replay needs no clone.
    const third = await call(IMPORT);
    expect(third._json?.graphId).toBe(first._json?.graphId);
    expect(third._json?.rehydrated).toBeUndefined();
    expect(h.clones).toBe(2);
    expect(h.debits).toHaveLength(1);
  });

  it('H1: a failed rehydrate charges nothing and the paid import stays replayable', async () => {
    await call(IMPORT);
    dropGraphs();
    const { CloneRefusal } = await import('../lib/absorb/clone-from-url.js');
    h.cloneError = new CloneRefusal('clone_failed', 'github down');
    const r = await call(IMPORT);
    expect(r._status).toBe(502);
    expect(h.debits).toHaveLength(1);
    h.cloneError = null;
    const ok = await call(IMPORT);
    expect(ok._status).toBe(200);
    expect(ok._json?.cost).toBe(0);
    expect(h.debits).toHaveLength(1);
  });

  it('H1: the scan options are in the key, so a shallow import does not answer or block a deep one', async () => {
    const shallow = await call(IMPORT);
    const deep = await call({ ...IMPORT, shallow: false });
    expect([shallow._status, deep._status]).toEqual([200, 200]);
    expect(deep._json?.replayed).toBeUndefined();
    expect(deep._json?.graphId).not.toBe(shallow._json?.graphId);
    expect(h.debits).toHaveLength(2);
    expect(h.debits[1].meta.importId).toBe(
      commitImportId(normalizeRepoUrl('https://github.com/owner/tiny'), 'a'.repeat(40), { shallow: false })
    );
  });

  it('N1: the same repo in another letter case is the same import and is charged once', async () => {
    const first = await call(IMPORT);
    const upper = await call({ ...IMPORT, repoUrl: 'https://github.com/OWNER/Tiny', importId: 'imp-case-0002' });
    expect(upper._status).toBe(200);
    expect(upper._json?.replayed).toBe(true);
    expect(upper._json?.graphId).toBe(first._json?.graphId);
    expect(h.debits).toHaveLength(1);
  });

  it('N3: an unauthenticated caller is refused before ls-remote and the clone', async () => {
    const res = { _status: 200, _json: null as any, status(c: number) { res._status = c; return res; }, json(d: any) { res._json = d; return res; } };
    await scan({ body: IMPORT, authenticated: false, userId: USER, headers: {} } as unknown as Request, res as unknown as Response);
    expect(res._status).toBe(401);
    expect(h.resolves).toBe(0);
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  });

  it('N4: parallel scans by one account are serialized, so the second is refused (402) instead of overdrawing', async () => {
    h.balance = 10; // covers exactly one scan
    h.shas.set(normalizeRepoUrl('https://github.com/owner/other'), 'b'.repeat(40));
    const [a, b] = await Promise.all([
      call(IMPORT),
      call({ ...IMPORT, repoUrl: 'https://github.com/owner/other', importId: 'imp-0002-bbbb' }),
    ]);
    expect([a._status, b._status].sort()).toEqual([200, 402]);
    expect(h.debits).toHaveLength(1);
    expect(h.balance).toBe(0);
  });
});

describe('/scan repoUrl import: credits before the claim and clone (Treasurer, #617)', () => {
  it('a broke account gets 402 before start: no ls-remote, no claim, no clone, no debit', async () => {
    h.balance = 0;
    const r = await call(IMPORT);
    expect(r._status).toBe(402);
    expect(h.resolves).toBeLessThanOrEqual(1); // one ls-remote to see if the import is already paid (Treasurer 2026-10-24)
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  });
  it('returns balanceOwedCents when the settle leaves the account owing', async () => {
    h.balance = 10;
    h.beforeDebit = () => {
      h.balance = 3; // a concurrent charge landed after the start check
    };
    const r = await call(IMPORT);
    expect(r._status).toBe(200);
    expect(r._json?.balanceOwedCents).toBe(7);
  });
  it('omits balanceOwedCents when nothing is owed', async () => {
    const r = await call(IMPORT);
    expect(r._status).toBe(200);
    expect(r._json?.balanceOwedCents).toBeUndefined();
  });
});

describe('/scan repoUrl import: CoS no-schema fallback (#617 N4)', () => {
  it('refuses a new paid start with 402 balance_owed while any balance is owed: no clone', async () => {
    h.balance = -7;
    const r = await call(IMPORT);
    expect(r._status).toBe(402);
    expect(r._json?.error).toBe('balance_owed');
    expect(r._json?.balanceOwedCents).toBe(7);
    expect(h.clones).toBe(0);
    expect(h.resolves).toBeLessThanOrEqual(1); // claim lookup only (Treasurer 2026-10-24)
    expect(h.debits).toHaveLength(0);
  });
  it('one paid scan in flight per account: parallel starts on a small balance keep the amount owed within MAX_BALANCE_OWED_CREDITS', async () => {
    const { MAX_BALANCE_OWED_CREDITS, ABSORB_MAX_PARALLEL_SCANS_PER_ACCOUNT } = await import('./absorb.js');
    expect(MAX_BALANCE_OWED_CREDITS).toBe(100);
    expect(ABSORB_MAX_PARALLEL_SCANS_PER_ACCOUNT).toBe(1);
    h.balance = 10;
    const repos = ['p1', 'p2', 'p3', 'p4', 'p5'].map((n, i) => ({
      ...IMPORT,
      repoUrl: 'https://github.com/owner/' + n,
      importId: 'imp-par-' + i + '-aaaa',
    }));
    const rs = await Promise.all(repos.map((b) => call(b)));
    const ok = rs.filter((r) => r._status === 200).length;
    expect(ok).toBe(1); // exactly the starts the balance covers
    expect(rs.filter((r) => r._status === 402)).toHaveLength(4);
    expect(h.debits).toHaveLength(1);
    expect(Math.max(0, -h.balance)).toBeLessThanOrEqual(MAX_BALANCE_OWED_CREDITS);
  });
  it('F2: a paid start whose price would push the amount owed past MAX_BALANCE_OWED_CREDITS is 402 before any clone', async () => {
    const credits = (await import('@holoscript/absorb-service/credits')) as unknown as {
      requireCredits: { mockImplementationOnce: (f: (u: string) => Promise<unknown>) => void };
    };
    // The gate passed, but the price is 101 over the balance it saw.
    credits.requireCredits.mockImplementationOnce(async (userId: string) => ({
      userId, costCents: 111, operationType: 'absorb_shallow', balanceCents: 10,
    }));
    const r = await call(IMPORT);
    expect(r._status).toBe(402);
    expect(r._json?.error).toBe('balance_owed_cap');
    // Treasurer 2026-10-24: one ls-remote to find a paid replay first; never a clone.
    expect(h.resolves).toBeLessThanOrEqual(1);
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
  });
  it('F2: owedCapRefusal allows owing exactly the cap and refuses one credit more', async () => {
    const { owedCapRefusal, MAX_BALANCE_OWED_CREDITS } = await import('./absorb.js');
    expect(owedCapRefusal({ costCents: 10, balanceCents: 10 })).toBeNull();
    expect(owedCapRefusal({ costCents: MAX_BALANCE_OWED_CREDITS, balanceCents: 0 })).toBeNull();
    expect(owedCapRefusal({ costCents: MAX_BALANCE_OWED_CREDITS + 1, balanceCents: 0 })?.status).toBe(402);
  });
  it('F5: ls-remote gets the normalized URL, not the raw one', async () => {
    const mod = await import('../lib/absorb/clone-from-url.js');
    const r = await call({ ...IMPORT, repoUrl: 'https://GitHub.com/Owner/Tiny.GIT/' });
    expect(r._status).toBe(200);
    expect(mod.resolveCommitSha).toHaveBeenLastCalledWith('https://github.com/owner/tiny.git', 'main');
  });
  it('F1: .GIT and .Git variants are one import, charged once', async () => {
    await call(IMPORT);
    const a = await call({ ...IMPORT, repoUrl: 'https://github.com/owner/Tiny.GIT', importId: 'imp-git-0001' });
    const b = await call({ ...IMPORT, repoUrl: 'https://github.com/owner/tiny.Git', importId: 'imp-git-0002' });
    expect(a._json?.replayed).toBe(true);
    expect(b._json?.replayed).toBe(true);
    expect(h.debits).toHaveLength(1);
  });
});

describe('/scan repoUrl import: Treasurer 2026-10-24, an owing account keeps what it paid for', () => {
  it('an account that owes can rehydrate an import it already paid for, at no new charge (402 balance_owed does not block it)', async () => {
    const first = await call(IMPORT);
    expect(first._status).toBe(200);
    expect(h.debits).toHaveLength(1);
    h.balance = -7; // now owes 7
    dropGraphs(); // restart: the graph must be rescanned (rehydrate)
    const again = await call(IMPORT);
    expect(again._status).toBe(200);
    expect(again._json?.rehydrated).toBe(true);
    expect(again._json?.graphId).toBe(first._json?.graphId);
    expect(again._json?.cost).toBe(0);
    expect(h.debits).toHaveLength(1);
    // And a plain replay (graph live) is also free and allowed.
    const replay = await call(IMPORT);
    expect(replay._status).toBe(200);
    expect(replay._json?.cost).toBe(0);
    expect(h.debits).toHaveLength(1);
    expect(h.balance).toBe(-7);
  });

  it('the same owing account is still refused (402 balance_owed) for a NEW import: no clone, no debit, claim not kept', async () => {
    h.balance = -7;
    const r = await call(IMPORT);
    expect(r._status).toBe(402);
    expect(r._json?.error).toBe('balance_owed');
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
    h.balance = 1000; // paid up: the claim was released, so the import runs and charges once
    const ok = await call(IMPORT);
    expect(ok._status).toBe(200);
    expect(ok._json?.replayed).toBeUndefined();
    expect(h.debits).toHaveLength(1);
  });
});

describe('/scan repoUrl import: absorb is the only biller, v1 included (CoS final 2026-10-24 05:39)', () => {
  const V1 = { orchestratorBilled: true };
  it('a v1 call is charged once in absorb to the signed account; the cost header is informational; a replay answers 0', async () => {
    const r = await call(IMPORT, V1);
    expect(r._status).toBe(200);
    expect(h.debits).toHaveLength(1);
    expect(h.debits[0]).toMatchObject({ userId: USER, cents: 10 });
    expect(r._headers['X-Absorb-Billed-Account']).toBe('v1');
    expect(r._headers['X-Absorb-Credit-Cost']).toBe('10'); // what absorb charged
    const again = await call(IMPORT, V1);
    expect(again._json?.replayed).toBe(true);
    expect(again._headers['X-Absorb-Credit-Cost']).toBe('0');
    expect(h.debits).toHaveLength(1);
    expect(h.balance).toBe(990);
  });

  it('a v1 call has the same pre-call gate: a broke account is 402 before any clone, nothing charged, no cost header', async () => {
    h.balance = 5;
    const r = await call(IMPORT, V1);
    expect(r._status).toBe(402);
    expect(h.clones).toBe(0);
    expect(h.debits).toHaveLength(0);
    expect(r._headers['X-Absorb-Credit-Cost']).toBeUndefined();
  });

  it('HOLD fix: an unpaid v1 import is never marked paid, so it cannot rehydrate free; the retry is charged', async () => {
    h.beforeDebit = () => {
      throw new Error('ledger unavailable'); // the charge never happens
    };
    const failed = await call(IMPORT, V1);
    expect(failed._status).toBe(500);
    expect(failed._headers['X-Absorb-Credit-Cost']).toBeUndefined();
    expect(h.debits).toHaveLength(0);
    h.beforeDebit = null;
    dropGraphs(); // restart: a "done" import would rehydrate free here
    const retry = await call(IMPORT, V1);
    expect(retry._status).toBe(200);
    expect(retry._json?.rehydrated).toBeUndefined();
    expect(retry._json?.replayed).toBeUndefined();
    expect(h.debits).toHaveLength(1);
    expect(retry._headers['X-Absorb-Credit-Cost']).toBe('10');
  });

  it('a paid v1 import rehydrates free after a restart (it was charged in absorb)', async () => {
    const first = await call(IMPORT, V1);
    expect(h.debits).toHaveLength(1);
    dropGraphs();
    const again = await call(IMPORT, V1);
    expect(again._json?.rehydrated).toBe(true);
    expect(again._json?.graphId).toBe(first._json?.graphId);
    expect(again._headers['X-Absorb-Credit-Cost']).toBe('0');
    expect(h.debits).toHaveLength(1);
  });

  it('a non-2xx v1 call carries no cost header', async () => {
    const { CloneRefusal } = await import('../lib/absorb/clone-from-url.js');
    h.cloneError = new CloneRefusal('clone_failed', 'github down');
    const fail = await call(IMPORT, V1);
    expect(fail._status).toBe(502);
    expect(fail._headers['X-Absorb-Credit-Cost']).toBeUndefined();
    expect(fail._headers['X-Absorb-Billed-Account']).toBeUndefined();
    expect(h.debits).toHaveLength(0);
  });

  it('a non-orchestrator call is charged and sets no cost header', async () => {
    const r = await call(IMPORT);
    expect(h.debits).toHaveLength(1);
    expect(r._headers['X-Absorb-Credit-Cost']).toBeUndefined();
  });
});
