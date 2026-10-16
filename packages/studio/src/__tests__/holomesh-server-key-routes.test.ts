/**
 * The 7 routes that sent HOLOMESH_API_KEY (audit 2026-10-15). User-scoped or
 * spending calls refuse a keyless caller with 404 no_holomesh_agent and never
 * send the server key. Server-only jobs are founder-gated. Twin: the refusal
 * cases fail before this change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const SERVER_KEY = 'server-founder-key';
const { founder } = vi.hoisted(() => ({ founder: { ok: false } }));

vi.mock('@/lib/api-auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/api-auth')>()),
  requireFounder: vi.fn(async () =>
    founder.ok
      ? { user: { id: 'u-founder' } }
      : NextResponse.json({ error: 'Founder access required' }, { status: 403 })
  ),
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@holoscript/framework', () => ({
  TEAM_MODES: ['planning', 'build', 'review', 'research'],
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('HOLOMESH_API_KEY', SERVER_KEY);
  founder.ok = false;
  fetchMock = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const req = (url: string, init: { method?: string; body?: unknown; auth?: string } = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.auth ? { authorization: init.auth } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const id = (v: string) => ({ params: Promise.resolve({ id: v }) });

async function expectNoAgent(res: Response) {
  expect(res.status).toBe(404);
  expect(((await res.json()) as { code: string }).code).toBe('no_holomesh_agent');
  expect(fetchMock).not.toHaveBeenCalled();
}
function sentAuth(): string[] {
  return fetchMock.mock.calls.map(
    (c) => ((c[1] as RequestInit | undefined)?.headers as Record<string, string>)?.Authorization
  );
}

describe('team/[id]/templates/apply (user-scoped team write)', () => {
  it('keyless → 404 no_holomesh_agent, nothing upstream', async () => {
    const { POST } = await import('../app/api/holomesh/team/[id]/templates/apply/route');
    await expectNoAgent(
      await POST(
        req('/api/holomesh/team/t1/templates/apply', { body: { templateSlug: 'x' } }),
        id('t1')
      )
    );
  });
});

describe('team/[id]/mode (user-scoped team write)', () => {
  it('keyless → 404 no_holomesh_agent, nothing upstream', async () => {
    const { POST } = await import('../app/api/holomesh/team/[id]/mode/route');
    await expectNoAgent(
      await POST(req('/api/holomesh/team/t1/mode', { body: { mode: 'planning' } }), id('t1'))
    );
  });
  it('own key → every upstream call carries the caller key, never the server key', async () => {
    const { POST } = await import('../app/api/holomesh/team/[id]/mode/route');
    const res = await POST(
      req('/api/holomesh/team/t1/mode', { body: { mode: 'planning' }, auth: 'Bearer caller' }),
      id('t1')
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(new Set(sentAuth())).toEqual(new Set(['Bearer caller']));
  });
});

describe('team/[id]/board/sync (server-only mirror)', () => {
  it('non-founder → 403, nothing upstream', async () => {
    const { POST } = await import('../app/api/holomesh/team/[id]/board/sync/route');
    const res = await POST(
      req('/api/holomesh/team/t1/board/sync', { auth: 'Bearer caller' }),
      id('t1')
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('transactions/sync (server-only mirror)', () => {
  it('non-founder → 403, nothing upstream', async () => {
    const { POST } = await import('../app/api/holomesh/transactions/sync/route');
    const res = await POST(req('/api/holomesh/transactions/sync', { auth: 'Bearer caller' }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('workspace/paper-opt-in (team board/knowledge writes)', () => {
  it('keyless + createBoardTasks → 404 no_holomesh_agent, nothing upstream', async () => {
    const { POST } = await import('../app/api/workspace/paper-opt-in/route');
    await expectNoAgent(
      await POST(
        req('/api/workspace/paper-opt-in', {
          body: { workspaceId: 'w', localPath: '/nowhere', teamId: 't1', createBoardTasks: true },
        })
      )
    );
  });
});

describe('operations/request-run (server-only, founder + signed seat)', () => {
  it('non-founder → 403, nothing upstream', async () => {
    const { POST } = await import('../app/api/operations/request-run/route');
    const res = await POST(
      req('/api/operations/request-run', { body: { label: 'x', command: 'y' } })
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('agents/fleet/[id] (user-scoped agent management, spend caps)', () => {
  it.each(['GET', 'PATCH', 'DELETE'])('%s keyless → 404 no_holomesh_agent', async (method) => {
    const mod = await import('../app/api/agents/fleet/[id]/route');
    const h = mod[method as 'GET' | 'PATCH' | 'DELETE'];
    await expectNoAgent(
      await h(
        req('/api/agents/fleet/a1', {
          method,
          body: method === 'PATCH' ? { status: 'paused' } : undefined,
        }),
        id('a1')
      )
    );
  });
  it('own key → forwarded with the caller key only', async () => {
    const { GET } = await import('../app/api/agents/fleet/[id]/route');
    await GET(req('/api/agents/fleet/a1', { method: 'GET', auth: 'Bearer caller' }), id('a1'));
    expect(sentAuth()).toEqual(['Bearer caller']);
  });
});
