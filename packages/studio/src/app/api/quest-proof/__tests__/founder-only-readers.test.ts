/**
 * #607 follow-up (a): inbox, next-actions, board and decide are founder-only.
 * A signed-out caller gets 401, a signed-in non-founder 403, and neither causes
 * any upstream call with Studio's team key. Missing key/team config is a 503 with
 * no upstream call (never an unauthenticated upstream call).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The next-actions route pulls in the shared task classifier; its first import
// can take several seconds on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({ res: null as unknown }));
vi.mock('@/lib/api-auth', () => ({
  requireFounder: async () => h.res ?? { user: { id: 'founder' } },
}));
// Old routes used getServerSession directly; give them a signed-in NON-founder.
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'not-founder' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const ROUTES: Array<{ name: string; load: () => Promise<Record<string, unknown>>; method: 'GET' | 'POST'; body?: unknown }> = [
  { name: 'inbox', load: () => import('../inbox/route'), method: 'GET' },
  { name: 'next-actions', load: () => import('../next-actions/route'), method: 'GET' },
  { name: 'next-actions', load: () => import('../next-actions/route'), method: 'POST', body: { taskId: 't1' } },
  { name: 'board', load: () => import('../board/route'), method: 'GET' },
  { name: 'decide', load: () => import('../decide/route'), method: 'POST', body: { taskIds: ['t1'] } },
];

function req(name: string, method: string, body?: unknown) {
  return new NextRequest(`https://holoscript.studio/api/quest-proof/${name}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('HOLOMESH_TEAM_ID', 'team_test');
  vi.stubEnv('HOLOMESH_API_KEY', 'test-key');
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ tasks: [], items: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  h.res = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Founder Console readers are founder-only', () => {
  for (const r of ROUTES) {
    for (const [status, label] of [[401, 'signed out'], [403, 'non-founder']] as const) {
      it(`${r.method} ${r.name}: ${label} -> ${status}, no upstream call`, async () => {
        h.res = NextResponse.json({ error: label }, { status });
        const handler = (await r.load())[r.method] as (q: NextRequest) => Promise<Response>;
        const res = await handler(req(r.name, r.method, r.body));
        expect(res.status).toBe(status);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
    it(`${r.method} ${r.name}: founder but no team key -> 503, no upstream call`, async () => {
      vi.stubEnv('HOLOMESH_API_KEY', '');
      vi.stubEnv('HOLOMESH_KEY', '');
      const handler = (await r.load())[r.method] as (q: NextRequest) => Promise<Response>;
      const res = await handler(req(r.name, r.method, r.body));
      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it(`${r.method} ${r.name}: founder reaches the team API`, async () => {
      const handler = (await r.load())[r.method] as (q: NextRequest) => Promise<Response>;
      await handler(req(r.name, r.method, r.body));
      expect(fetchMock).toHaveBeenCalled();
    });
  }

  it('none of the four is on the public paths list any more', async () => {
    const src = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(__dirname, '../../../../lib/api-public-paths.ts'),
      'utf8'
    );
    for (const n of ['inbox', 'next-actions', 'board', 'decide']) {
      expect(src).not.toContain(`'/api/quest-proof/${n}'`);
    }
  });
});
