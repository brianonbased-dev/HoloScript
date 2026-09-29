/**
 * What a person sees when Brittney's serving box is asleep and nothing else may
 * answer (production, 2026-09-29). It reached the chat as "Sorry, I hit an
 * error: SOVEREIGN_WARMING: ... Retry in ~1 minute", and the minute was never
 * true. The route now sends the refusal's own plain `notice` as Brittney's
 * reply; any other provider failure is still reported as an error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fail: null as Error | null }));

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
vi.mock('@/lib/brittney/dailyUsage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brittney/dailyUsage')>()),
  countBrittneyMessage: async () => ({ used: 1, limit: 40, allowed: true, resetsAt: new Date() }),
  paidFallbackOpen: async () => false,
  recordPaidAnswer: async () => {},
}));
vi.mock('@/lib/brittney/provider', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/brittney/provider')>();
  return {
    ...real,
    resolveBrittneyProviderAsync: async () => {
      throw h.fail;
    },
  };
});

import { POST } from './route';
import { getServerSession } from 'next-auth';
import { WARMING_NOTICE, warmingError } from '@/lib/brittney/provider';

function chatReq() {
  const text = JSON.stringify({ messages: [{ role: 'user', content: 'Make me a rose garden' }] });
  return {
    headers: new Headers({ 'content-type': 'application/json', host: 'localhost:3000' }),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Parameters<typeof POST>[0];
}

async function events(res: Response): Promise<Array<{ type: string; payload: unknown }>> {
  return (await res.text())
    .split('\n')
    .map((l) => l.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  delete process.env.BRITTNEY_PAID_FALLBACK;
  delete process.env.BRITTNEY_OPERATOR_TRANSPORT;
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'person-1' } });
});

describe('Brittney when her serving box is asleep', () => {
  it('says so in plain words, as her reply, not as an error', async () => {
    h.fail = warmingError();
    const out = await events(await POST(chatReq()));

    expect(out).toEqual([
      { type: 'text', payload: WARMING_NOTICE },
      { type: 'done', payload: null },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/SOVEREIGN_WARMING|~1 minute|demand|fleet/i);
  });

  it('still reports any other provider failure as an error', async () => {
    h.fail = new Error('No Brittney provider configured');
    const out = await events(await POST(chatReq()));

    expect(out[0]).toEqual({ type: 'error', payload: 'No Brittney provider configured' });
  });
});
