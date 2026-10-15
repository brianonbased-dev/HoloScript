/**
 * POST /credits/grant: admin credit grant.
 * Twin tests: every case fails on main (route absent) and passes with it.
 * In-memory fakes only; no database, no keys, nothing in .env.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const state = {
  users: [] as Array<{ id: string; email: string }>,
  grants: [] as any[],
  balance: new Map<string, number>(),
  addCreditsCalls: 0,
};

let mockDb: any = null;
vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => mockDb) }));
vi.mock('../db/schema.js', () => ({
  users: { __t: 'users', id: 'users.id', email: 'users.email' },
  adminCreditGrants: { __t: 'grants', idempotencyKey: 'grants.idempotencyKey' },
  accounts: {}, absorbProjects: {}, moltbookAgents: {},
}));
vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: vi.fn(), desc: vi.fn(), sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

function rowsFor(table: any, clause: { col: string; val: unknown }): any[] {
  if (table.__t === 'users') {
    const field = clause.col === 'users.id' ? 'id' : 'email';
    return state.users.filter((u) => (u as any)[field] === clause.val);
  }
  return state.grants.filter((g) => g.idempotencyKey === clause.val);
}

function makeDb() {
  return {
    select: () => {
      const q: any = {};
      q.from = (t: any) => { q.t = t; return q; };
      q.where = (c: any) => { q.c = c; return q; };
      q.limit = async () => rowsFor(q.t, q.c).map((r) => ({ ...r }));
      return q;
    },
  };
}

// Fake addCredits with real transaction semantics: the audit insert enforces the
// unique key, and a throw inside the transaction rolls the balance back.
const fakeAddCredits = async (userId: string, amount: number, _d: string, opts: any) => {
    state.addCreditsCalls++;
    const before = state.balance.get(userId) ?? 0;
    await Promise.resolve(); // let a racing request interleave
    const after = before + amount;
    state.balance.set(userId, after);
    const tx = {
      insert: () => ({
        values: (v: any) => ({
          returning: async () => {
            if (state.grants.some((g) => g.idempotencyKey === v.idempotencyKey)) {
              throw Object.assign(new Error('duplicate key'), { code: '23505' });
            }
            const row = { ...v, createdAt: new Date('2026-10-14T00:00:00Z') };
            state.grants.push(row);
            return [row];
          },
        }),
      }),
    };
    try {
      await opts.withinTransaction?.(tx, { balanceCents: after });
    } catch (e) {
      state.balance.set(userId, (state.balance.get(userId) ?? 0) - amount);
      throw e;
    }
    return { balanceCents: after };
};
vi.mock('@holoscript/absorb-service/credits', () => {
  const addCredits = (...a: any[]) => (fakeAddCredits as any)(...a);
  return { addCredits, default: { addCredits } };
});

function mockReq(body: any, extra: Record<string, any> = {}): Request {
  return { params: {}, query: {}, headers: {}, body, isAdmin: true, githubUsername: 'admin-gh', ...extra } as any;
}
function mockRes() {
  const res: any = { _status: 200, _json: null };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (d: any) => { res._json = d; return res; };
  return res as Response & { _status: number; _json: any };
}

async function grantHandler() {
  const { adminRouter } = await import('./admin.js');
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === '/credits/grant' && l.route.methods.post
  );
  if (!layer) throw new Error('POST /credits/grant is not registered');
  return { router: adminRouter as any, layer, handle: layer.route.stack.at(-1).handle };
}

const good = (over: Record<string, unknown> = {}) => ({
  user: 'creator@example.com', amountCents: 2500, note: 'Beta thank-you', idempotencyKey: 'grant-001', ...over,
});

beforeEach(() => {
  state.users = [{ id: USER_ID, email: 'creator@example.com' }];
  state.grants = [];
  state.balance = new Map([[USER_ID, 100]]);
  state.addCreditsCalls = 0;
  mockDb = makeDb();
});

describe('POST /credits/grant', () => {
  it('refuses a non-admin before the handler runs', async () => {
    const { router, layer } = await grantHandler();
    const guardIdx = router.stack.findIndex((l: any) => !l.route && l.handle.name === 'requireAdmin');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(router.stack.indexOf(layer));
    const res = mockRes();
    const next = vi.fn();
    router.stack[guardIdx].handle(mockReq(good(), { isAdmin: false }), res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(state.addCreditsCalls).toBe(0);
  });

  it('grants once, audits it, and a repeated key adds nothing and returns the original', async () => {
    const { handle } = await grantHandler();
    const r1 = mockRes();
    await handle(mockReq(good()), r1);
    expect(r1._status).toBe(201);
    expect(r1._json).toMatchObject({ granted: true, userId: USER_ID, amountCents: 2500, balanceAfterCents: 2600, grantedBy: 'admin-gh', note: 'Beta thank-you', idempotencyKey: 'grant-001' });
    expect(state.grants).toHaveLength(1);

    const r2 = mockRes();
    await handle(mockReq(good()), r2);
    expect(r2._status).toBe(200);
    expect(r2._json).toMatchObject({ replayed: true, balanceAfterCents: 2600, grantedAt: r1._json.grantedAt });
    expect(state.balance.get(USER_ID)).toBe(2600);
    expect(state.addCreditsCalls).toBe(1);
  });

  it('is race-safe: two concurrent requests with one key credit once', async () => {
    const { handle } = await grantHandler();
    const [a, b] = [mockRes(), mockRes()];
    await Promise.all([handle(mockReq(good()), a), handle(mockReq(good()), b)]);
    expect([a._status, b._status].sort()).toEqual([200, 201]);
    expect(state.balance.get(USER_ID)).toBe(2600);
    expect(state.grants).toHaveLength(1);
  });

  it('refuses a reused key for a different amount', async () => {
    const { handle } = await grantHandler();
    await handle(mockReq(good()), mockRes());
    const r = mockRes();
    await handle(mockReq(good({ amountCents: 9999 })), r);
    expect(r._status).toBe(409);
    expect(state.balance.get(USER_ID)).toBe(2600);
  });

  it('holds the $500 cap and accepts exactly $500', async () => {
    const { handle } = await grantHandler();
    const over = mockRes();
    await handle(mockReq(good({ amountCents: 50001 })), over);
    expect(over._status).toBe(400);
    expect(state.addCreditsCalls).toBe(0);
    const at = mockRes();
    await handle(mockReq(good({ amountCents: 50000, idempotencyKey: 'grant-cap' })), at);
    expect(at._status).toBe(201);
  });

  it.each([
    ['missing note', { note: undefined }],
    ['blank note', { note: '   ' }],
    ['missing key', { idempotencyKey: undefined }],
    ['zero amount', { amountCents: 0 }],
    ['fractional amount', { amountCents: 10.5 }],
    ['string amount', { amountCents: '100' }],
  ])('rejects %s with 400 and moves nothing', async (_n, over) => {
    const { handle } = await grantHandler();
    const r = mockRes();
    await handle(mockReq(good(over)), r);
    expect(r._status).toBe(400);
    expect(state.addCreditsCalls).toBe(0);
  });

  it('returns 404 for an unknown user, by email or by id', async () => {
    const { handle } = await grantHandler();
    const byEmail = mockRes();
    await handle(mockReq(good({ user: 'nobody@example.com' })), byEmail);
    expect(byEmail._status).toBe(404);
    const byId = mockRes();
    await handle(mockReq(good({ user: '99999999-2222-4333-8444-555555555555', idempotencyKey: 'k2' })), byId);
    expect(byId._status).toBe(404);
    expect(state.addCreditsCalls).toBe(0);
  });

  it('finds a user by id', async () => {
    const { handle } = await grantHandler();
    const r = mockRes();
    await handle(mockReq(good({ user: USER_ID })), r);
    expect(r._status).toBe(201);
  });
});
