/**
 * Who may read and write a team board — the second door into the same rows.
 *
 * `/export` beside this route was closed to non-members in this same branch.
 * `/board` returns the SAME holomeshBoardTasks rows and was reachable by
 * anyone who named a team id, falling through to the upstream relay under our
 * own server key. Closing one of two doors into one set of rows is what makes
 * the other one reachable-and-surprising, so this suite holds both to the same
 * bar and, critically, proves the Studio UI still gets in.
 *
 * Why the checks are not identical to /export: /export has no browser caller,
 * so it can demand a mesh key outright. /board is the team UI's own read
 * (app/teams/[id]/page.tsx:93, components/teams/BoardTab.tsx:109 and four more)
 * and those arrive with nothing but a session cookie. A gate that refused them
 * would be a silent lockout, which counts equally with a door left open — so
 * both admissions are asserted here, not just the refusals.
 *
 * Nothing reaches the network: every upstream answer is supplied locally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stand = vi.hoisted(() => {
  process.env.HOLOMESH_API_URL = 'https://mesh.test';
  process.env.HOLOMESH_API_KEY = 'studio-own-server-key';
  return { session: null as { user: { id: string } } | null };
});

vi.mock('next-auth', () => ({ getServerSession: async () => stand.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/db/client', () => ({ getDb: () => null }));
vi.mock('@/lib/rate-limiter', () => ({
  boardReadLimit: () => ({ ok: true, remaining: 99, reset: Date.now() + 60_000 }),
  boardWriteLimit: () => ({ ok: true, remaining: 99, reset: Date.now() + 60_000 }),
}));

import { GET, POST } from './route';

const MEMBER_KEY = 'mesh_sk_member_key';
const OUTSIDER_KEY = 'mesh_sk_outsider_key';
const MEMBER = 'agent_member_1';
const OUTSIDER = 'agent_outsider_2';
const TEAM = 'team-1';

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface UpstreamOptions {
  members?: unknown;
  membersStatus?: number;
}

/**
 * The upstream mesh, answering the way mcp-server answers: `/me` identifies
 * whichever key was presented, `/members` lists the team, and the board relay
 * returns a task. Each key maps to its own agent, so an outsider is never
 * silently the member.
 */
function upstream(keyToAgent: Record<string, string>, options: UpstreamOptions = {}) {
  const calls: string[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    const target = String(url);
    calls.push(target);
    const headers = new Headers(init?.headers);
    const presented =
      (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') ||
      headers.get('x-mcp-api-key') ||
      '';

    // `/members` is tested FIRST and the identity endpoint is matched by its
    // whole path. A shorter `/me` test also matches `/members`, which silently
    // answers the membership question with an identity payload — the member
    // list then looks unreadable and every caller gets a 502. The refusals
    // still "passed" while proving nothing, which is the failure this file
    // exists to catch elsewhere.
    if (target.includes('/members')) {
      if (options.membersStatus && options.membersStatus !== 200) {
        return reply({ error: 'upstream said no' }, options.membersStatus);
      }
      return reply(options.members ?? { members: [{ agentId: MEMBER }] });
    }
    if (target.includes('/api/holomesh/me')) {
      const agentId = keyToAgent[presented];
      if (!agentId) return reply({ error: 'Authentication required.' }, 401);
      return reply({ success: true, agentId, name: agentId });
    }
    return reply({ success: true, board: { open: [{ id: 'task-1', status: 'open' }] } });
  };
  return { calls, fetchImpl: vi.fn(impl) };
}

const KNOWN_KEYS = { [MEMBER_KEY]: MEMBER, [OUTSIDER_KEY]: OUTSIDER };

function request(headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest(`https://studio.test/api/holomesh/team/${TEAM}/board`, {
    method,
    headers,
    ...(method === 'GET' ? {} : { body: '{}' }),
  });
}

const params = { params: Promise.resolve({ id: TEAM }) };

beforeEach(() => {
  stand.session = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('who may read a team board', () => {
  it('refuses a caller with nothing at all, and spends nothing of ours doing it', async () => {
    const { calls, fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request(), params);

    expect(res.status).toBe(401);
    // Not one upstream call. An unidentified caller must never cause our own
    // key to be presented on their behalf — the refusal has to happen before
    // the relay, not inside it.
    expect(calls).toEqual([]);
  });

  it('refuses a real key belonging to someone who is not on the team', async () => {
    const { calls, fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': OUTSIDER_KEY }), params);

    expect(res.status).toBe(403);
    // Identity and membership only — the board itself was never fetched, so
    // the rows never existed to be leaked.
    expect(calls.some((url) => url.includes('/board'))).toBe(false);
  });

  it('refuses a key upstream does not recognise', async () => {
    const { fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ authorization: 'Bearer not-a-real-key' }), params);

    expect(res.status).toBe(401);
  });

  it('refuses when membership cannot be read, rather than passing', async () => {
    // A check that answers "allow" when it could not reach the truth is not a
    // check.
    const { calls, fetchImpl } = upstream(KNOWN_KEYS, { membersStatus: 500 });
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params);

    expect(res.status).toBe(502);
    expect(calls.some((url) => url.includes('/board'))).toBe(false);
  });

  it('lets a member of that team read it, under their own key', async () => {
    const { calls, fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params);

    expect(res.status).toBe(200);
    expect(calls.some((url) => url.includes('/board'))).toBe(true);
  });

  it('lets the signed-in Studio UI read it, which arrives with only a cookie', async () => {
    // The positive control that matters most here. Six call sites in the app
    // fetch this path from the browser with no key of any kind; a gate that
    // refused them would pass every refusal test above while the team board
    // went dark.
    stand.session = { user: { id: 'user-signed-in' } };
    const { fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request(), params);

    expect(res.status).toBe(200);
  });
});

describe('who may write to a team board', () => {
  it('refuses an anonymous write before it reaches the relay', async () => {
    const { calls, fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await POST(request({}, 'POST'), params);

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('refuses a write from a real key that is not on the team', async () => {
    const { calls, fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await POST(request({ 'x-mcp-api-key': OUTSIDER_KEY }, 'POST'), params);

    expect(res.status).toBe(403);
    expect(calls.some((url) => url.includes('/board'))).toBe(false);
  });

  it('lets the signed-in UI post a mode change, as app/teams/[id]/page.tsx:118 does', async () => {
    stand.session = { user: { id: 'user-signed-in' } };
    const { fetchImpl } = upstream(KNOWN_KEYS);
    vi.stubGlobal('fetch', fetchImpl);

    const res = await POST(request({}, 'POST'), params);

    expect(res.status).toBe(200);
  });
});
