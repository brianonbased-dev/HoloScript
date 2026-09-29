/**
 * The route's side of the paid fallback (founder sheet line "answers-always").
 *
 * The route may let a paid model answer a cold fleet only when one is
 * configured AND today's paid ceiling has room, and it writes every paid
 * answer's billed cost to the day's total when the turn ends, summed over all
 * of the answer's rounds. The ceiling's own arithmetic (dailyUsage.paid.test)
 * and the provider's choice (provider.test) have their own tests; the count,
 * the ceiling and the provider are faked here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  open: true,
  providerOpts: [] as Array<{ paidFallback?: boolean } | undefined>,
  opened: 0,
  recorded: [] as Array<{ userId: string; costUsd: number }>,
  paid: true,
  rounds: [] as Array<Array<Record<string, unknown>>>,
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
vi.mock('@/lib/brittney/dailyUsage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brittney/dailyUsage')>()),
  countBrittneyMessage: async () => ({ used: 1, limit: 40, allowed: true, resetsAt: new Date() }),
  paidFallbackOpen: async () => {
    h.opened += 1;
    return h.open;
  },
  recordPaidAnswer: async (userId: string, costUsd: number) => {
    h.recorded.push({ userId, costUsd });
  },
}));
vi.mock('@/lib/brittney/provider', () => ({
  resolveBrittneyProvider: () => {
    throw new Error('sync resolve not used in tests');
  },
  resolveBrittneyProviderAsync: async (_byok: unknown, opts?: { paidFallback?: boolean }) => {
    h.providerOpts.push(opts);
    return {
      provider: {
        streamCompletion: () => {
          const items = h.rounds.shift() ?? [{ type: 'message_stop', finishReason: 'end_turn' }];
          return (async function* () {
            for (const c of items) yield c;
          })();
        },
      },
      model: 'grok-4.6',
      maxTokens: 1000,
      providerName: h.paid ? 'xai' : 'fleet',
      ...(h.paid ? { paid: true } : {}),
    };
  },
}));

import { POST } from './route';
import { getServerSession } from 'next-auth';
import { UNREPORTED_ROUND_COST_USD } from '@/lib/brittney/dailyUsage';

function chatReq() {
  const text = JSON.stringify({ messages: [{ role: 'user', content: 'Make me a rose garden' }] });
  return {
    headers: new Headers({ 'content-type': 'application/json', host: 'localhost:3000' }),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Parameters<typeof POST>[0];
}

const say = (costUsd?: number) => [
  { type: 'text_delta', text: 'Here is your garden.' },
  {
    type: 'message_stop',
    finishReason: 'end_turn',
    usage: {
      promptTokens: 100,
      completionTokens: 10,
      totalTokens: 110,
      ...(costUsd === undefined ? {} : { costUsd }),
    },
  },
];
const BROKEN = 'composition "Garden" {\n  object "Rose" {\n';
const FIXED = 'composition "Garden" {\n  object "Rose" {\n    geometry: "sphere"\n  }\n}\n';
const applyCode = (id: string, code: string, costUsd: number) => [
  { type: 'tool_use_start', id, name: 'apply_code' },
  { type: 'tool_use_end', id, input: { code } },
  {
    type: 'message_stop',
    finishReason: 'tool_use',
    usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, costUsd },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  process.env.BRITTNEY_PAID_FALLBACK = 'xai';
  delete process.env.BRITTNEY_BENCHMARK_KEY;
  delete process.env.BRITTNEY_OPERATOR_TRANSPORT;
  h.open = true;
  h.opened = 0;
  h.providerOpts.length = 0;
  h.recorded.length = 0;
  h.paid = true;
  h.rounds.length = 0;
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'person-1' } });
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

describe('the route and the paid fallback', () => {
  it('lets a paid model answer only when one is configured and the ceiling has room', async () => {
    h.open = true;
    await (await POST(chatReq())).text();
    h.open = false;
    await (await POST(chatReq())).text();
    delete process.env.BRITTNEY_PAID_FALLBACK;
    await (await POST(chatReq())).text();

    expect(h.providerOpts.map((o) => o?.paidFallback)).toEqual([true, false, false]);
    // With nothing configured the ceiling is not even read.
    expect(h.opened).toBe(2);
  });

  it('writes a paid answer’s billed cost to the day’s total', async () => {
    h.rounds.push(say(0.0421));
    await (await POST(chatReq())).text();

    expect(h.recorded).toEqual([{ userId: 'person-1', costUsd: 0.0421 }]);
  });

  it('sums the cost of every round of one answer', async () => {
    // Round 1 writes code that does not draw; the self-check sends it back and
    // round 2 is the repair. Both rounds were billed.
    h.rounds.push(applyCode('t1', BROKEN, 0.03), applyCode('t2', FIXED, 0.02));
    await (await POST(chatReq())).text();

    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].costUsd).toBeCloseTo(0.05, 10);
  });

  it('counts a round whose cost was not reported at the high default, never as free', async () => {
    h.rounds.push(say(undefined));
    await (await POST(chatReq())).text();

    expect(h.recorded).toEqual([{ userId: 'person-1', costUsd: UNREPORTED_ROUND_COST_USD }]);
  });

  it('records nothing for an answer from our own machines', async () => {
    h.paid = false;
    h.rounds.push(say(0.0421));
    await (await POST(chatReq())).text();

    expect(h.recorded).toEqual([]);
  });
});
