/**
 * CoS, #620 (a): absorb-service answers 402 for an insufficient balance BEFORE
 * any debit, so a Studio fallback that gets a 402 never charged anyone.
 *
 * Runs the REAL credit service (packages/absorb-service/src/credits:
 * requireCredits, checkBalance, deductCredits) on a real Postgres (PGlite,
 * in-process) with the real credit tables from migration 0000, and drives the
 * real /scan route. Enabled by PGLITE_MODULE (path to an installed
 * @electric-sql/pglite); skipped otherwise.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@holoscript/absorb-service/credits', async () => {
  const real = await import('../../../../packages/absorb-service/src/credits/index');
  return { ...real, default: real };
});
vi.mock('@holoscript/absorb-service/engine', () => {
  const api = {
    absorbRootRefusal: () => null,
    CodebaseScanner: class {
      async scan() {
        return { files: [{ path: 'src/main.ts', imports: [] }], stats: { durationMs: 1, fileCount: 1 } };
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

const here = dirname(fileURLToPath(import.meta.url));
const USER = '11111111-2222-4333-8444-555555555555';
const PROJECT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const mod = process.env.PGLITE_MODULE;

type Handler = (req: Request, res: Response) => Promise<unknown>;

describe.skipIf(!mod)('/scan with an insufficient balance: 402 before any debit (real ledger, PGlite via drizzle pg-proxy)', () => {
  let pg: any;
  let scan: Handler;

  beforeAll(async () => {
    const { PGlite } = (await import(pathToFileURL(mod!).href)) as { PGlite: new () => any };
    pg = new PGlite();
    const sql = readFileSync(join(here, '..', '..', 'drizzle', '0000_fantastic_masque.sql'), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      if (/CREATE TABLE "credit_(accounts|transactions)"/.test(stmt)) await pg.exec(stmt);
    }
    // drizzle's pg-proxy driver over PGlite: real SQL from the real drizzle
    // queries, executed by a real Postgres.
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(async (text: string, params: unknown[], method: string) => {
      const r = await pg.query(text, params, method === 'execute' ? {} : { rowMode: 'array' });
      return { rows: r.rows };
    });
    const credits = await import('@holoscript/absorb-service/credits');
    (credits as any).setDbProvider(() => db);
    const { absorbRouter } = await import('./absorb.js');
    const stack = (absorbRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> }).stack;
    const route = stack.find((l) => l.route?.path === '/scan' && l.route.methods.post)!.route!;
    scan = route.stack[route.stack.length - 1].handle;
  }, 60_000);

  async function call() {
    const res = {
      _status: 200,
      _json: null as Record<string, unknown> | null,
      status(c: number) { res._status = c; return res; },
      json(d: Record<string, unknown>) { res._json = d; return res; },
    };
    await scan(
      { body: { path: '/repo/x', shallow: true, projectId: PROJECT }, authenticated: true, userId: USER, headers: {} } as unknown as Request,
      res as unknown as Response
    );
    return res;
  }

  it('balance 0: 402, zero usage rows, balance unchanged', async () => {
    await pg.query(`INSERT INTO credit_accounts (user_id, balance_cents) VALUES ($1, 0)`, [USER]);
    const res = await call();
    expect(res._status).toBe(402);
    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM credit_transactions`);
    expect(rows[0].n).toBe(0);
    const bal = await pg.query(`SELECT balance_cents FROM credit_accounts WHERE user_id = $1`, [USER]);
    expect(bal.rows[0].balance_cents).toBe(0);
  });

  it('twin: with enough balance the same scan is charged once (the harness can see a debit)', async () => {
    await pg.query(`UPDATE credit_accounts SET balance_cents = 1000 WHERE user_id = $1`, [USER]);
    const res = await call();
    expect(res._status).toBe(200);
    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM credit_transactions WHERE type = 'usage'`);
    expect(rows[0].n).toBe(1);
  });
});