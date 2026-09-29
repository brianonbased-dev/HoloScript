/**
 * POST /api/brittney/compact: Brittney sums up the older part of a long chat.
 *
 * Signed in only; the summary comes from the model Brittney answers with (thinking
 * removed); a cold fleet answers 503 with the plain warming notice; a paid summary
 * is added to the day's paid total; an empty request is refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  signedIn: true,
  fail: null as Error | null,
  paid: false,
  content: '<think>let me see</think>They are building a rose garden with 20 bushes.',
  costUsd: 0.0123 as number | undefined,
  prompts: [] as string[],
  recorded: [] as Array<{ userId: string; costUsd: number }>,
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuthOrApiKey: async () =>
    h.signedIn
      ? { user: { id: 'person-1' } }
      : NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
}));
vi.mock('@/lib/rate-limiter', () => ({ rateLimit: () => ({ ok: true, remaining: 9 }) }));
vi.mock('@/lib/brittney/dailyUsage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brittney/dailyUsage')>()),
  paidFallbackOpen: async () => false,
  recordPaidAnswer: async (userId: string, costUsd: number) => {
    h.recorded.push({ userId, costUsd });
  },
}));
vi.mock('@/lib/brittney/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brittney/provider')>()),
  resolveBrittneyProviderAsync: async () => {
    if (h.fail) throw h.fail;
    return {
      provider: {
        complete: async (req: { messages: Array<{ content: string }> }) => {
          h.prompts.push(req.messages[0].content);
          return { content: h.content, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: h.costUsd }, model: 'm' };
        },
      },
      model: 'qwen3:14b',
      maxTokens: 1000,
      providerName: h.paid ? 'xai' : 'fleet',
      ...(h.paid ? { paid: true } : {}),
    };
  },
}));

import { POST } from './route';
import { WARMING_NOTICE, warmingError } from '@/lib/brittney/provider';

const req = (body: unknown) =>
  new Request('http://localhost/api/brittney/compact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

const older = [
  { role: 'user', content: 'Make me a rose garden.' },
  { role: 'assistant', content: 'Here is a garden with 20 bushes.' },
];

beforeEach(() => {
  h.signedIn = true;
  h.fail = null;
  h.paid = false;
  h.costUsd = 0.0123;
  h.prompts.length = 0;
  h.recorded.length = 0;
  delete process.env.BRITTNEY_PAID_FALLBACK;
});

describe('POST /api/brittney/compact', () => {
  it('returns the summary Brittney wrote, without her thinking', async () => {
    const res = await POST(req({ messages: older }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      summary: 'They are building a rose garden with 20 bushes.',
      model: 'qwen3:14b',
    });
    expect(h.prompts[0]).toContain('Person: Make me a rose garden.');
    expect(h.prompts[0]).toContain('Brittney: Here is a garden with 20 bushes.');
  });

  it('refuses a signed-out caller before any model call', async () => {
    h.signedIn = false;
    const res = await POST(req({ messages: older }));
    expect(res.status).toBe(401);
    expect(h.prompts).toEqual([]);
  });

  it('answers a cold fleet with the plain warming notice', async () => {
    h.fail = warmingError();
    const res = await POST(req({ messages: older }));
    expect(res.status).toBe(503);
    expect((await res.json()).notice).toBe(WARMING_NOTICE);
  });

  it('adds a paid summary to the day’s paid total, and records nothing for our own machines', async () => {
    h.paid = true;
    await POST(req({ messages: older }));
    expect(h.recorded).toEqual([{ userId: 'person-1', costUsd: 0.0123 }]);
    h.paid = false;
    h.recorded.length = 0;
    await POST(req({ messages: older }));
    expect(h.recorded).toEqual([]);
  });

  it('refuses a request with nothing to sum up', async () => {
    const res = await POST(req({ messages: [{ role: 'system', content: 'x' }] }));
    expect(res.status).toBe(400);
    expect(h.prompts).toEqual([]);
  });
});
