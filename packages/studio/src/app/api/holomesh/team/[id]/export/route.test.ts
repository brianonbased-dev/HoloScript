/**
 * GET /api/holomesh/team/[id]/export — a live door, closed.
 *
 * Until 2026-09-16 this route had no caller check of any kind. Naming any team
 * id returned that team's whole board — team record, open, claimed and blocked
 * columns, and the done list — fetched upstream under Studio's own
 * HOLOMESH_API_KEY. The allowlist excused it as "teasers only", citing the
 * premium-exits suite; that suite only ever asserted the KNOWLEDGE rows came
 * back cut, and a board task is not premium-classified at all. The last test
 * here is the one that proves the excuse was empty: a member's export still
 * contains the task text in full, so the premium cut never protected it and the
 * caller check is the only thing that ever did.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.HOLOMESH_API_URL = 'https://mesh.test';
  process.env.HOLOMESH_API_KEY = 'studio-own-server-key';
});

const stand = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../../../../../db/client', () => ({ getDb: () => stand.db }));

import { GET } from './route';

const MEMBER_KEY = 'mesh_sk_member_key';
const OUTSIDER_KEY = 'mesh_sk_outsider_key';
const MEMBER = 'agent_member_1';
const OUTSIDER = 'agent_outsider_2';
const TEAM = 'team-1';

const TASK_TITLE = 'Rotate the treasury signing key';
const TASK_DETAIL = 'Board text nobody outside this team should be reading';

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
 * The upstream mesh, answering the way mcp-server answers: `/me` identifies a
 * key, `/members` lists a team, and the export route's own three reads return
 * a team, a marketplace page and a board.
 */
function upstreamAnswers(options: UpstreamOptions = {}) {
  const calls: string[] = [];
  const impl = async (url: string): Promise<Response> => {
    calls.push(url);

    if (url.includes('/api/holomesh/me')) {
      return reply({ success: true, agentId: MEMBER, name: 'Member Agent' });
    }
    if (url.includes('/members')) {
      if (options.membersStatus && options.membersStatus !== 200) {
        return reply({ error: 'upstream said no' }, options.membersStatus);
      }
      return reply(options.members ?? { members: [{ agentId: MEMBER }] });
    }
    if (url.includes('/board')) {
      return reply({
        board: { open: [{ status: 'open', title: TASK_TITLE, description: TASK_DETAIL }] },
        done: { recent: [{ status: 'done', title: 'Shipped something' }] },
      });
    }
    if (url.includes('/marketplace')) {
      return reply([{ id: 'k1', content: 'Free knowledge', price: 0 }]);
    }
    return reply({ id: TEAM, name: 'Team One' });
  };
  return { calls, fetchImpl: vi.fn(impl) };
}

/** Identify a key as its own agent, so an outsider is not silently the member. */
function upstreamIdentifying(keyToAgent: Record<string, string>, options: UpstreamOptions = {}) {
  const calls: string[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push(url);
    const headers = new Headers(init?.headers);
    const presented =
      (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') ||
      headers.get('x-mcp-api-key') ||
      '';

    if (url.includes('/api/holomesh/me')) {
      const agentId = keyToAgent[presented];
      if (!agentId) return reply({ error: 'Authentication required.' }, 401);
      return reply({ success: true, agentId, name: agentId });
    }
    if (url.includes('/members')) {
      if (options.membersStatus && options.membersStatus !== 200) {
        return reply({ error: 'upstream said no' }, options.membersStatus);
      }
      return reply(options.members ?? { members: [{ agentId: MEMBER }] });
    }
    if (url.includes('/board')) {
      return reply({ board: { open: [] }, done: { recent: [] } });
    }
    if (url.includes('/marketplace')) return reply([]);
    return reply({ id: TEAM });
  };
  return { calls, fetchImpl: vi.fn(impl) };
}

function request(headers: Record<string, string> = {}) {
  return new NextRequest(`https://studio.test/api/holomesh/team/${TEAM}/export`, { headers });
}

const params = { params: Promise.resolve({ id: TEAM }) };

beforeEach(() => {
  stand.db = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('who may export a team board', () => {
  it('refuses an anonymous caller, and spends nothing of ours doing it', async () => {
    const { calls, fetchImpl } = upstreamAnswers();
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request(), params);

    expect(res.status).toBe(401);
    // Not one upstream call: an unidentified caller must never cause our own
    // key to be presented on their behalf.
    expect(calls).toEqual([]);
  });

  it('refuses a key upstream does not recognise', async () => {
    const { fetchImpl } = upstreamIdentifying({ [MEMBER_KEY]: MEMBER });
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ authorization: 'Bearer not-a-real-key' }), params);

    expect(res.status).toBe(401);
  });

  it("refuses a real key belonging to someone who is not on the team", async () => {
    const { calls, fetchImpl } = upstreamIdentifying({
      [MEMBER_KEY]: MEMBER,
      [OUTSIDER_KEY]: OUTSIDER,
    });
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': OUTSIDER_KEY }), params);

    expect(res.status).toBe(403);
    // Identity and membership only — the board itself was never fetched.
    expect(calls.some((url) => url.includes('/board'))).toBe(false);
  });

  it('refuses when membership cannot be read, rather than passing', async () => {
    // A check that answers "allow" when it could not reach the truth is not a
    // check. 502, not 200.
    const { calls, fetchImpl } = upstreamIdentifying(
      { [MEMBER_KEY]: MEMBER },
      { membersStatus: 500 }
    );
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params);

    expect(res.status).toBe(502);
    expect(calls.some((url) => url.includes('/board'))).toBe(false);
  });

  it('refuses when the membership answer carries no member list', async () => {
    const { fetchImpl } = upstreamIdentifying({ [MEMBER_KEY]: MEMBER }, { members: { ok: true } });
    vi.stubGlobal('fetch', fetchImpl);

    expect((await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params)).status).toBe(502);
  });

  it('lets a member of that team export it', async () => {
    const { fetchImpl } = upstreamAnswers();
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teamId).toBe(TEAM);
    expect(body.board.open).toHaveLength(1);
  });

  it('accepts the member list in the nested shape too', async () => {
    const { fetchImpl } = upstreamAnswers({ members: { team: { members: [{ agentId: MEMBER }] } } });
    vi.stubGlobal('fetch', fetchImpl);

    expect((await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params)).status).toBe(200);
  });
});

describe('why the premium cut was never cover for this door', () => {
  it('a member export carries the task text in full, uncut', async () => {
    const { fetchImpl } = upstreamAnswers();
    vi.stubGlobal('fetch', fetchImpl);

    const res = await GET(request({ 'x-mcp-api-key': MEMBER_KEY }), params);
    const text = JSON.stringify(await res.json());

    // The premium view only rewrites rows carrying knowledge text on a priced
    // row. Board tasks carry `title` and `description` and no price, so they
    // pass through whole — which is correct for a member, and is exactly why
    // an anonymous caller could not be allowed to ask.
    expect(text).toContain(TASK_TITLE);
    expect(text).toContain(TASK_DETAIL);
  });
});
