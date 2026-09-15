/**
 * SECURITY: /api/holomesh/agent/[id]/withdraw
 *
 * 1. Only the agent itself (its own HoloMesh API key, checked by mcp-server's
 *    GET /api/holomesh/me) may read or file a withdrawal. Until 2026-09-15 the
 *    route had no auth: anyone could withdraw any agent's earnings to any address.
 * 2. The balance check and the withdrawal row are atomic: two concurrent
 *    requests cannot both spend the same balance.
 *
 * The fake database below models Postgres' pg_advisory_xact_lock: a lock taken
 * inside a transaction blocks any other taker of the same key until that
 * transaction ends. Every fake query yields to the event loop first, so two
 * requests that are NOT serialised by a lock really do interleave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

type Row = Record<string, unknown>;

const { state } = vi.hoisted(() => ({
  state: { db: null as unknown },
}));

vi.mock('../../../../../../db/client', () => ({ getDb: () => state.db }));
vi.mock('../../../../../../lib/rate-limiter', () => ({
  rateLimit: () => ({ ok: true }),
}));

import { GET, POST } from './route';
import { centsToUsdcAtomicUnits } from '../../../../_lib/usdc';

const OWNER = 'agent_owner_1';
const OTHER = 'agent_other_2';
const OWNER_KEY = 'holomesh_sk_owner_key_0001';
const OTHER_KEY = 'holomesh_sk_other_key_0002';
const STUDIO_SERVICE_KEY = 'holomesh_sk_studio_service_key';
const ADDRESS = '0x1111111111111111111111111111111111111111';

function createFakeDb(initial: Row[]) {
  const rows: Row[] = initial.map((r) => ({ ...r }));
  const dialect = new PgDialect();
  const locks = new Map<string, Promise<void>>();
  const lockKeys: string[] = [];
  let transactions = 0;
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));

  function balance(agentId: string) {
    let earnings = 0;
    let withdrawals = 0;
    for (const r of rows) {
      if (r.toAgentId === agentId && (r.type === 'purchase' || r.type === 'reward')) {
        earnings += Number(r.amount);
      }
      if (r.fromAgentId === agentId && r.type === 'withdrawal' && r.status !== 'failed') {
        withdrawals += Number(r.amount);
      }
    }
    return { earnings, withdrawals };
  }

  function runner(held: Array<{ key: string; release: () => void }> | null) {
    return {
      async execute(query: SQL) {
        const { sql: text, params } = dialect.sqlToQuery(query);
        await tick();
        if (text.includes('pg_advisory_xact_lock')) {
          if (!held) throw new Error('advisory xact lock taken outside a transaction');
          const key = String(params[0]);
          lockKeys.push(key);
          while (locks.has(key)) await locks.get(key);
          let release!: () => void;
          locks.set(key, new Promise<void>((resolve) => (release = resolve)));
          held.push({ key, release });
          return { rows: [] };
        }
        if (text.includes('AS earnings')) {
          return { rows: [balance(String(params[0]))] };
        }
        throw new Error(`unexpected SQL in fake db: ${text}`);
      },
      insert() {
        return {
          values: async (value: Row) => {
            await tick();
            rows.push({ ...value });
          },
        };
      },
      update() {
        return {
          set: (patch: Row) => ({
            where: async () => {
              await tick();
              Object.assign(rows[rows.length - 1] ?? {}, patch);
            },
          }),
        };
      },
      select() {
        const chain = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: async () => rows.filter((r) => r.type === 'withdrawal'),
        };
        return chain;
      },
    };
  }

  const db = {
    ...runner(null),
    async transaction<T>(cb: (tx: ReturnType<typeof runner>) => Promise<T>): Promise<T> {
      transactions += 1;
      const held: Array<{ key: string; release: () => void }> = [];
      try {
        return await cb(runner(held));
      } finally {
        for (const h of held) {
          locks.delete(h.key);
          h.release();
        }
      }
    },
  };

  return {
    db,
    rows,
    lockKeys,
    get transactions() {
      return transactions;
    },
  };
}

/** mcp-server's GET /api/holomesh/me: which agent owns which key. */
function stubMcpServer() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const auth = headers.get('authorization') ?? '';
    const key = auth.replace(/^Bearer\s+/i, '') || headers.get('x-mcp-api-key') || '';
    const agents: Record<string, { agentId: string; name: string }> = {
      [OWNER_KEY]: { agentId: OWNER, name: 'Owner Agent' },
      [OTHER_KEY]: { agentId: OTHER, name: 'Other Agent' },
      // If Studio ever fell back to its own key, the caller would become this agent.
      [STUDIO_SERVICE_KEY]: { agentId: OWNER, name: 'Studio Service Agent' },
    };
    const agent = agents[key];
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });
    }
    return new Response(JSON.stringify({ success: true, ...agent, wallet: '0xabc' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function postReq(agentId: string, body: Row, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/holomesh/agent/${agentId}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function getReq(agentId: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/holomesh/agent/${agentId}/withdraw`, {
    method: 'GET',
    headers,
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const EARNED_1000 = [{ id: 'tx_earn', type: 'purchase', toAgentId: OWNER, amount: 1000 }];

describe('/api/holomesh/agent/[id]/withdraw', () => {
  const savedKey = process.env.HOLOMESH_API_KEY;

  beforeEach(() => {
    process.env.HOLOMESH_API_KEY = STUDIO_SERVICE_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env.HOLOMESH_API_KEY;
    else process.env.HOLOMESH_API_KEY = savedKey;
  });

  describe('POST: who may withdraw', () => {
    it('refuses an anonymous caller with 401 and writes nothing', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(postReq(OWNER, { amount: 500, toAddress: ADDRESS }), params(OWNER));

      expect(res.status).toBe(401);
      expect(fake.rows.filter((r) => r.type === 'withdrawal')).toHaveLength(0);
    });

    it("never borrows Studio's own HoloMesh key to identify an anonymous caller", async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      const fetchMock = stubMcpServer();

      const res = await POST(postReq(OWNER, { amount: 500, toAddress: ADDRESS }), params(OWNER));

      expect(res.status).toBe(401);
      for (const [, init] of fetchMock.mock.calls) {
        expect(new Headers(init?.headers).get('authorization') ?? '').not.toContain(
          STUDIO_SERVICE_KEY
        );
      }
      expect(fake.rows.filter((r) => r.type === 'withdrawal')).toHaveLength(0);
    });

    it('refuses an unrecognised key with 401', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(
        postReq(OWNER, { amount: 500, toAddress: ADDRESS }, { Authorization: 'Bearer nope' }),
        params(OWNER)
      );

      expect(res.status).toBe(401);
      expect(fake.rows.filter((r) => r.type === 'withdrawal')).toHaveLength(0);
    });

    it("refuses another agent's key with 403: no one withdraws someone else's earnings", async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(
        postReq(
          OWNER,
          { amount: 500, toAddress: ADDRESS },
          { Authorization: `Bearer ${OTHER_KEY}` }
        ),
        params(OWNER)
      );

      expect(res.status).toBe(403);
      expect(fake.rows.filter((r) => r.type === 'withdrawal')).toHaveLength(0);
    });

    it('lets the agent withdraw its own earnings, under its verified name', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(
        postReq(
          OWNER,
          { amount: 400, toAddress: ADDRESS, agentName: 'Spoofed Name' },
          { Authorization: `Bearer ${OWNER_KEY}` }
        ),
        params(OWNER)
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('pending');
      expect(body.remainingBalance).toBe(600);

      const withdrawals = fake.rows.filter((r) => r.type === 'withdrawal');
      expect(withdrawals).toHaveLength(1);
      expect(withdrawals[0]).toMatchObject({
        fromAgentId: OWNER,
        fromAgentName: 'Owner Agent',
        amount: 400,
        status: 'pending',
      });
    });

    it('accepts the x-mcp-api-key header convention mcp-server also accepts', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(
        postReq(OWNER, { amount: 400, toAddress: ADDRESS }, { 'x-mcp-api-key': OWNER_KEY }),
        params(OWNER)
      );

      expect(res.status).toBe(200);
    });
  });

  describe('POST: the balance cannot be spent twice', () => {
    it('two concurrent withdrawals of 800 against a 1000 balance: exactly one succeeds', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const auth = { Authorization: `Bearer ${OWNER_KEY}` };
      const [a, b] = await Promise.all([
        POST(postReq(OWNER, { amount: 800, toAddress: ADDRESS }, auth), params(OWNER)),
        POST(postReq(OWNER, { amount: 800, toAddress: ADDRESS }, auth), params(OWNER)),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 402]);
      const withdrawn = fake.rows
        .filter((r) => r.type === 'withdrawal')
        .reduce((sum, r) => sum + Number(r.amount), 0);
      expect(withdrawn).toBe(800);
    });

    it('checks and reserves inside one transaction under a per-agent lock', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(
        postReq(
          OWNER,
          { amount: 100, toAddress: ADDRESS },
          { Authorization: `Bearer ${OWNER_KEY}` }
        ),
        params(OWNER)
      );

      expect(res.status).toBe(200);
      expect(fake.transactions).toBe(1);
      expect(fake.lockKeys).toEqual([`holomesh-withdraw:${OWNER}`]);
    });

    it('refuses more than the balance with 402 and writes nothing', async () => {
      const fake = createFakeDb(EARNED_1000);
      state.db = fake.db;
      stubMcpServer();

      const res = await POST(
        postReq(
          OWNER,
          { amount: 1001, toAddress: ADDRESS },
          { Authorization: `Bearer ${OWNER_KEY}` }
        ),
        params(OWNER)
      );

      expect(res.status).toBe(402);
      expect(fake.rows.filter((r) => r.type === 'withdrawal')).toHaveLength(0);
    });
  });

  describe("GET: history and destination addresses are the owner's only", () => {
    const history = [
      ...EARNED_1000,
      {
        id: 'wtx_1',
        type: 'withdrawal',
        fromAgentId: OWNER,
        amount: 200,
        status: 'pending',
        metadata: { toAddress: ADDRESS },
      },
    ];

    it('refuses an anonymous caller with 401', async () => {
      state.db = createFakeDb(history).db;
      stubMcpServer();
      const res = await GET(getReq(OWNER), params(OWNER));
      expect(res.status).toBe(401);
    });

    it("refuses another agent's key with 403", async () => {
      state.db = createFakeDb(history).db;
      stubMcpServer();
      const res = await GET(getReq(OWNER, { Authorization: `Bearer ${OTHER_KEY}` }), params(OWNER));
      expect(res.status).toBe(403);
    });

    it('shows the owner its balance and history', async () => {
      state.db = createFakeDb(history).db;
      stubMcpServer();
      const res = await GET(getReq(OWNER, { Authorization: `Bearer ${OWNER_KEY}` }), params(OWNER));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.balance).toMatchObject({ earnings: 1000, withdrawals: 200, available: 800 });
      expect(body.withdrawalHistory).toHaveLength(1);
    });
  });
});

describe('centsToUsdcAtomicUnits', () => {
  it('keeps the cents: 150 cents is 1.50 USDC, not 1.00', () => {
    expect(centsToUsdcAtomicUnits(150)).toBe('1500000');
    expect(centsToUsdcAtomicUnits(100)).toBe('1000000');
    expect(centsToUsdcAtomicUnits(1)).toBe('10000');
  });

  it('rejects fractional and negative cents', () => {
    expect(() => centsToUsdcAtomicUnits(1.5)).toThrow(RangeError);
    expect(() => centsToUsdcAtomicUnits(-1)).toThrow(RangeError);
  });
});
