/**
 * Doors audit 2026-09-15 (rework of #299): POST /api/knowledge/query.
 *
 * Before: no login; any body went upstream under the server's own key and
 * every row came back raw, premium text included. Now the caller must be
 * signed in, only the known fields are forwarded, and premium rows come back
 * as teasers for everyone (Studio cannot see purchases or map a Studio user to
 * a knowledge author). The upstream is a stand-in fetch; nothing leaves this
 * process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: async () => auth.result }));

import { POST } from './route';

const PAID_TAIL = 'QUERY-ROUTE-PAID-TAIL-NOT-FOR-FREE';
const SHORT_SECRET = 'Short query-route paid tip';

const rows = [
  {
    id: 'q-long',
    type: 'gotcha',
    content: `${'Paid query body. '.repeat(12)}${PAID_TAIL}`,
    metadata: { price: 0.05, authorId: 'someone', title: `Title ${PAID_TAIL}` },
  },
  { id: 'q-short', type: 'gotcha', content: SHORT_SECRET, metadata: { price: 0.05 } },
  { id: 'q-free', type: 'wisdom', content: 'Free query wisdom stays whole', metadata: { price: 0 } },
];

let calls: Array<{ url: string; body: Record<string, unknown> }> = [];

function request(body: unknown): Request {
  return new Request('https://studio.test/api/knowledge/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/knowledge/query (doors audit)', () => {
  beforeEach(() => {
    calls = [];
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'dummy-studio-query-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ results: rows }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    auth.result = { user: { id: 'studio-user-1', name: 'Studio User' } };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('refuses a caller who is not signed in and sends nothing upstream', async () => {
    auth.result = NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const res = await POST(request({ search: 'paid', limit: 5 }));

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('gives a signed-in caller premium rows as teasers only and free rows whole', async () => {
    const res = await POST(request({ search: 'paid', limit: 5 }));
    const text = JSON.stringify(await res.json());

    expect(res.status).toBe(200);
    expect(text).not.toContain(PAID_TAIL);
    expect(text).not.toContain(SHORT_SECRET);
    expect(text).toContain('Free query wisdom stays whole');
    expect(text).toContain('q-short');
  });

  it('forwards only the fields the Studio callers send, with the limit capped', async () => {
    await POST(
      request({
        search: 'paid',
        limit: 5000,
        workspace_id: 'studio-ws',
        decayed: true,
        include_all_premium: true,
        api_key: 'caller-supplied',
      })
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      search: 'paid',
      limit: 50,
      workspace_id: 'studio-ws',
      decayed: true,
    });
  });
});
