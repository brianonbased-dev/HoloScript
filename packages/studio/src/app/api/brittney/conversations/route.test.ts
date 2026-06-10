import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { GET as GET_ONE, PATCH, DELETE } from './[id]/route';
import { POST as POST_MESSAGES } from './[id]/messages/route';

// Mock next-auth so getSession() (via getServerSession) is controllable.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

// No DB → exercise the in-memory owner-scoped fallback.
vi.mock('../../../../db/client', () => ({
  getDb: vi.fn(() => null),
}));

import { getServerSession } from 'next-auth';
import { getDb } from '../../../../db/client';

const mockSession = (id: string | null) =>
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(id ? { user: { id } } : null);

function jsonReq(body: unknown) {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Parameters<typeof POST>[0];
}

function getReq(url: string) {
  return {
    headers: new Headers(),
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function createConvo(scope = 'workspace:w1', title = '') {
  const res = await POST(jsonReq({ scope, title }));
  expect(res.status).toBe(201);
  const { conversation } = await res.json();
  return conversation as { id: string; scope: string; title: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  delete process.env.BRITTNEY_BENCHMARK_KEY;
  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
  // Reset the in-memory fallback stores between tests.
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

describe('POST /api/brittney/conversations', () => {
  it('requires authentication', async () => {
    mockSession(null);
    const res = await POST(jsonReq({ scope: 'workspace:w1' }));
    expect(res.status).toBe(401);
  });

  it('rejects a conversation with no scope', async () => {
    mockSession('user-1');
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it('creates a conversation scoped to the authenticated owner', async () => {
    mockSession('user-1');
    const convo = await createConvo('workspace:w1', 'My Thread');
    expect(convo.id).toMatch(/^[0-9a-f]{8}-/i);
    expect(convo.scope).toBe('workspace:w1');
    expect(convo.title).toBe('My Thread');
  });
});

describe('GET /api/brittney/conversations', () => {
  it('lists only the caller’s conversations, filtered by scope', async () => {
    mockSession('user-1');
    await createConvo('workspace:w1');
    await createConvo('workspace:w2');

    mockSession('user-2');
    const otherList = await (await GET(getReq('http://localhost/api/brittney/conversations'))).json();
    expect(otherList.conversations).toHaveLength(0);

    mockSession('user-1');
    const all = await (await GET(getReq('http://localhost/api/brittney/conversations'))).json();
    expect(all.conversations).toHaveLength(2);

    const scoped = await (
      await GET(getReq('http://localhost/api/brittney/conversations?scope=workspace%3Aw1'))
    ).json();
    expect(scoped.conversations).toHaveLength(1);
    expect(scoped.conversations[0].scope).toBe('workspace:w1');
  });

  it('excludes archived conversations unless includeArchived=1', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    const patched = await PATCH(jsonReq({ archived: true }), routeParams(convo.id));
    expect(patched.status).toBe(200);

    const defaultList = await (
      await GET(getReq('http://localhost/api/brittney/conversations'))
    ).json();
    expect(defaultList.conversations).toHaveLength(0);

    const withArchived = await (
      await GET(getReq('http://localhost/api/brittney/conversations?includeArchived=1'))
    ).json();
    expect(withArchived.conversations).toHaveLength(1);
    expect(withArchived.conversations[0].archivedAt).not.toBeNull();
  });
});

describe('POST /api/brittney/conversations/[id]/messages', () => {
  it('appends messages with monotonic seq and auto-titles from the first user message', async () => {
    mockSession('user-1');
    const convo = await createConvo();

    const res = await POST_MESSAGES(
      jsonReq({
        messages: [
          { role: 'user', content: 'Build me a glowing orb that orbits the player' },
          { role: 'assistant', content: 'Done — added @glowing and an orbit behavior.' },
        ],
      }),
      routeParams(convo.id)
    );
    expect(res.status).toBe(201);
    const { conversation, messages } = await res.json();
    expect(messages.map((m: { seq: number }) => m.seq)).toEqual([1, 2]);
    expect(conversation.messageCount).toBe(2);
    expect(conversation.title).toBe('Build me a glowing orb that orbits the player');
    expect(conversation.lastMessageAt).not.toBeNull();

    // A second batch continues the seq sequence.
    const res2 = await POST_MESSAGES(
      jsonReq({ messages: [{ role: 'user', content: 'Make it red' }] }),
      routeParams(convo.id)
    );
    const second = await res2.json();
    expect(second.messages[0].seq).toBe(3);
    // Title set by the first batch is not overwritten.
    expect(second.conversation.title).toBe('Build me a glowing orb that orbits the player');
  });

  it('rejects invalid roles and empty content', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    const badRole = await POST_MESSAGES(
      jsonReq({ messages: [{ role: 'system', content: 'x' }] }),
      routeParams(convo.id)
    );
    expect(badRole.status).toBe(400);
    const emptyContent = await POST_MESSAGES(
      jsonReq({ messages: [{ role: 'user', content: '' }] }),
      routeParams(convo.id)
    );
    expect(emptyContent.status).toBe(400);
  });

  it('cannot append to another user’s conversation', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    mockSession('user-2');
    const res = await POST_MESSAGES(
      jsonReq({ messages: [{ role: 'user', content: 'hijack' }] }),
      routeParams(convo.id)
    );
    expect(res.status).toBe(404);
  });

  it('accepts tool-only turns (empty content + toolCalls) but rejects bare empty content', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    const ok = await POST_MESSAGES(
      jsonReq({
        messages: [{ role: 'assistant', content: '', toolCalls: [{ tool: 'apply_code', success: true }] }],
      }),
      routeParams(convo.id)
    );
    expect(ok.status).toBe(201);

    const bad = await POST_MESSAGES(
      jsonReq({ messages: [{ role: 'assistant', content: '' }] }),
      routeParams(convo.id)
    );
    expect(bad.status).toBe(400);
  });

  it('rejects a toolCalls payload above the serialized size bound', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    const res = await POST_MESSAGES(
      jsonReq({
        messages: [
          { role: 'assistant', content: 'big tools', toolCalls: [{ data: 'x'.repeat(70 * 1024) }] },
        ],
      }),
      routeParams(convo.id)
    );
    expect(res.status).toBe(413);
  });
});

describe('GET /api/brittney/conversations/[id]', () => {
  it('returns the conversation with its messages, owner-scoped', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    await POST_MESSAGES(
      jsonReq({
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ],
      }),
      routeParams(convo.id)
    );

    const res = await GET_ONE(
      getReq(`http://localhost/api/brittney/conversations/${convo.id}`),
      routeParams(convo.id)
    );
    expect(res.status).toBe(200);
    const { messages } = await res.json();
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('hello');

    // Incremental fetch after a known seq.
    const incr = await (
      await GET_ONE(
        getReq(`http://localhost/api/brittney/conversations/${convo.id}?afterSeq=1`),
        routeParams(convo.id)
      )
    ).json();
    expect(incr.messages).toHaveLength(1);
    expect(incr.messages[0].content).toBe('hi there');

    mockSession('user-2');
    const denied = await GET_ONE(
      getReq(`http://localhost/api/brittney/conversations/${convo.id}`),
      routeParams(convo.id)
    );
    expect(denied.status).toBe(404);
  });
});

describe('PATCH + DELETE /api/brittney/conversations/[id]', () => {
  it('renames an owned conversation', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    const res = await PATCH(jsonReq({ title: 'Renamed Thread' }), routeParams(convo.id));
    expect(res.status).toBe(200);
    const { conversation } = await res.json();
    expect(conversation.title).toBe('Renamed Thread');
  });

  it('rejects a PATCH with no recognized fields', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    const res = await PATCH(jsonReq({}), routeParams(convo.id));
    expect(res.status).toBe(400);
  });

  it('deletes an owned conversation and its messages', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    await POST_MESSAGES(
      jsonReq({ messages: [{ role: 'user', content: 'doomed' }] }),
      routeParams(convo.id)
    );

    const res = await DELETE(
      getReq(`http://localhost/api/brittney/conversations/${convo.id}`),
      routeParams(convo.id)
    );
    expect(res.status).toBe(200);

    const gone = await GET_ONE(
      getReq(`http://localhost/api/brittney/conversations/${convo.id}`),
      routeParams(convo.id)
    );
    expect(gone.status).toBe(404);
  });

  it('cannot delete another user’s conversation', async () => {
    mockSession('user-1');
    const convo = await createConvo();
    mockSession('user-2');
    const res = await DELETE(
      getReq(`http://localhost/api/brittney/conversations/${convo.id}`),
      routeParams(convo.id)
    );
    expect(res.status).toBe(404);

    mockSession('user-1');
    const { conversations } = await (
      await GET(getReq('http://localhost/api/brittney/conversations'))
    ).json();
    expect(conversations).toHaveLength(1);
  });
});
