/**
 * The Brittney route counts each message against the person's daily limit
 * before any model is asked (founder sheet line "daily-limit").
 *
 * The count itself (lib/brittney/dailyUsage.ts) is faked here; its database
 * behaviour has its own tests. What is pinned here is the route's use of it:
 * over the limit, the person gets a plain sentence and no model runs; within
 * it, or with no count available, Brittney answers; the founder and the
 * benchmark runner are not counted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  modelCalls: 0,
  founder: false,
  count: null as null | { used: number; limit: number; allowed: boolean; resetsAt: Date },
  counted: [] as string[],
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn().mockResolvedValue(null) }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ getAll: () => [] }) }));
vi.mock('../../../db/client', () => ({ getDb: vi.fn(() => null) }));
vi.mock('@/lib/rate-limiter', () => ({ rateLimit: () => ({ ok: true, remaining: 19 }) }));
vi.mock('@/lib/creditGate', () => ({
  checkCredits: async () => ({ userId: 'free', error: null }),
  deductCredits: async () => {},
}));
vi.mock('@/lib/secrets/userSecretStore', () => ({ resolveUserSecret: async () => null }));
vi.mock('@/lib/brittney/cael', () => ({
  attachChain: () => ({ chainId: 'test-chain', prevChain: null, isNew: true }),
  buildBrittneyCaelRecord: () => ({ fnv1a_chain: 'test', tool_iters: 0 }),
  closeChain: () => ({ finalChain: 'test' }),
  commitRound: () => {},
  deriveSessionId: () => 'test-session',
  extractEvidencePaths: () => [],
}));
vi.mock('@/lib/workspace/workspaceIdentity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspace/workspaceIdentity')>()),
  isFounderWorkspaceIdentity: () => h.founder,
}));
vi.mock('@/lib/brittney/dailyUsage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brittney/dailyUsage')>()),
  countBrittneyMessage: async (userId: string) => {
    h.counted.push(userId);
    return h.count;
  },
}));
vi.mock('@/lib/brittney/provider', () => ({
  resolveBrittneyProvider: () => {
    throw new Error('sync resolve not used in tests');
  },
  resolveBrittneyProviderAsync: async () => ({
    provider: {
      streamCompletion: () => {
        h.modelCalls += 1;
        return (async function* () {
          yield { type: 'text_delta', text: 'Here is your garden.' };
          yield { type: 'message_stop', finishReason: 'end_turn' };
        })();
      },
    },
    model: 'test-model',
    maxTokens: 1000,
    providerName: 'anthropic',
  }),
}));

import { POST } from './route';
import { getServerSession } from 'next-auth';

function chatReq() {
  const text = JSON.stringify({ messages: [{ role: 'user', content: 'Make me a rose garden' }] });
  return {
    headers: new Headers({ 'content-type': 'application/json', host: 'localhost:3000' }),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Parameters<typeof POST>[0];
}

const MIDNIGHT = new Date(Date.now() + 5 * 3_600_000);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  delete process.env.BRITTNEY_BENCHMARK_KEY;
  delete process.env.BRITTNEY_OPERATOR_TRANSPORT;
  h.modelCalls = 0;
  h.founder = false;
  h.count = null;
  h.counted.length = 0;
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'person-1' } });
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

describe('the route counts each message against the daily limit first', () => {
  it('over the limit: a plain sentence for the person, and no model runs', async () => {
    h.count = { used: 41, limit: 40, allowed: false, resetsAt: MIDNIGHT };
    const res = await POST(chatReq());

    expect(res.status).toBe(429);
    const body = (await res.json()) as {
      code: string;
      notice: string;
      limit: number;
      resetsAt: string;
    };
    expect(body.code).toBe('daily_limit');
    expect(body.notice).toMatch(/today's 40 free messages with Brittney/);
    expect(body.limit).toBe(40);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(h.counted).toEqual(['person-1']);
    expect(h.modelCalls).toBe(0);
  });

  it('within the limit: Brittney answers', async () => {
    h.count = { used: 3, limit: 40, allowed: true, resetsAt: MIDNIGHT };
    const res = await POST(chatReq());

    expect(res.status).toBe(200);
    await res.text();
    expect(h.counted).toEqual(['person-1']);
    expect(h.modelCalls).toBe(1);
  });

  it('with no count available (no database): Brittney still answers', async () => {
    h.count = null;
    const res = await POST(chatReq());

    expect(res.status).toBe(200);
    await res.text();
    expect(h.modelCalls).toBe(1);
  });

  it('does not count the benchmark runner', async () => {
    process.env.BRITTNEY_BENCHMARK_KEY = 'bench-key-for-test';
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    h.count = { used: 999, limit: 40, allowed: false, resetsAt: MIDNIGHT };
    const req = chatReq();
    (req.headers as Headers).set('x-benchmark-key', 'bench-key-for-test');
    const res = await POST(req);

    expect(res.status).toBe(200);
    await res.text();
    expect(h.counted).toEqual([]);
    expect(h.modelCalls).toBe(1);
  });

  it('does not count the founder', async () => {
    h.founder = true;
    h.count = { used: 999, limit: 40, allowed: false, resetsAt: MIDNIGHT };
    const res = await POST(chatReq());

    expect(res.status).toBe(200);
    await res.text();
    expect(h.counted).toEqual([]);
    expect(h.modelCalls).toBe(1);
  });
});
