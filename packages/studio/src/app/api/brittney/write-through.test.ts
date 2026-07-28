/**
 * Server-side write-through tests (task qq65 / D.053) for POST /api/brittney.
 *
 * Exercises the in-memory conversation store (getDb → null) with a scripted
 * fake provider, asserting the route persists the user turn pre-stream and
 * the assistant turn (text + tool calls) at stream end — including the
 * partial-transcript persist on mid-stream provider failure, which is the
 * crash case this feature exists for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted control surface for the provider mock: per-test chunk script +
// captured LLMCompletionRequests (used to assert past-threads prompt injection).
const h = vi.hoisted(() => ({
  chunks: [] as Array<Record<string, unknown>>,
  captured: [] as Array<{
    messages: Array<{ role: string; content: unknown }>;
    tools?: Array<{ name: string }>;
  }>,
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

// No DB → exercise the in-memory owner-scoped fallback (same canonical module
// as conversationStore's import — one resolution, one mock).
vi.mock('../../../db/client', () => ({
  getDb: vi.fn(() => null),
}));

// Rate limiter: keyless test requests would share one bucket across tests.
vi.mock('@/lib/rate-limiter', () => ({
  rateLimit: () => ({ ok: true, remaining: 19 }),
}));

// Credit gate: studio_chat is a free op in prod; stub it hermetically so no
// fire-and-forget fetch leaves the test process.
vi.mock('@/lib/creditGate', () => ({
  checkCredits: async () => ({ userId: 'free', error: null }),
  deductCredits: async () => {},
}));

// BYOK vault lookup: fail-soft null (no vault in tests).
vi.mock('@/lib/secrets/userSecretStore', () => ({
  resolveUserSecret: async () => null,
}));

// CAEL: keep tests hermetic (the real module writes audit ndjson to disk).
vi.mock('@/lib/brittney/cael', () => ({
  attachChain: () => ({ chainId: 'test-chain', prevChain: null, isNew: true }),
  buildBrittneyCaelRecord: () => ({ fnv1a_chain: 'test', tool_iters: 0 }),
  closeChain: () => ({ finalChain: 'test' }),
  commitRound: () => {},
  deriveSessionId: () => 'test-session',
  extractEvidencePaths: () => [],
}));

// Scripted provider: yields h.chunks; a `{ __throw }` sentinel raises mid-stream.
vi.mock('@/lib/brittney/provider', () => ({
  resolveBrittneyProvider: () => {
    throw new Error('sync resolve not used in tests');
  },
  resolveBrittneyProviderAsync: async () => ({
    provider: {
      streamCompletion: (request: {
        messages: Array<{ role: string; content: unknown }>;
        tools?: Array<{ name: string }>;
      }) => {
        h.captured.push(request);
        const items = [...h.chunks];
        return (async function* () {
          for (const c of items) {
            if ('__throw' in c) throw new Error(String(c.__throw));
            yield c;
          }
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
import {
  createConversation,
  getMessages,
  listConversations,
  appendMessages,
} from '@/lib/brittney/conversationStore';

const mockSession = (id: string | null) =>
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(id ? { user: { id } } : null);

function chatReq(body: unknown) {
  const text = JSON.stringify(body);
  return {
    headers: new Headers({ 'content-type': 'application/json', host: 'localhost:3000' }),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Parameters<typeof POST>[0];
}

async function readEvents(res: Response): Promise<Array<{ type: string; payload: unknown }>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line.replace(/^data: /, '')) as { type: string; payload: unknown });
}

const textChunks = (...parts: string[]) => [
  ...parts.map((p) => ({ type: 'text_delta', text: p })),
  { type: 'message_stop', finishReason: 'end_turn' },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  delete process.env.BRITTNEY_BENCHMARK_KEY;
  delete process.env.BRITTNEY_OPERATOR_TRANSPORT;
  h.chunks.length = 0;
  h.captured.length = 0;
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

describe('POST /api/brittney write-through', () => {
  it('sends a 12-tool mode-scoped default registry to the provider', async () => {
    mockSession('user-tool-diet');
    h.chunks.push(...textChunks('queued'));

    await POST(
      chatReq({
        messages: [{ role: 'user', content: 'Add a task to the team board' }],
      })
    );

    const names = h.captured[0]?.tools?.map((t) => t.name) ?? [];
    expect(names.length).toBeLessThanOrEqual(12);
    expect(names).toContain('find_tools');
    expect(names).toContain('board_add_task');
    expect(names).toContain('suggest_ecosystem_gap');
    expect(names).not.toContain('create_object');
  });

  it('creates a conversation on scope-only requests and persists both turns', async () => {
    mockSession('user-wt-1');
    h.chunks.push(...textChunks('Hello ', 'world'));

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'Hello Brittney persistence' }],
        scope: 'workspace:wt1',
      })
    );
    const events = await readEvents(res);

    const convoEvent = events.find((e) => e.type === 'conversation');
    expect(convoEvent).toBeDefined();
    const { conversationId, created } = convoEvent!.payload as {
      conversationId: string;
      created: boolean;
    };
    expect(created).toBe(true);

    const persisted = events.filter((e) => e.type === 'persisted');
    expect(persisted.map((e) => (e.payload as { role: string }).role)).toEqual([
      'user',
      'assistant',
    ]);
    expect((persisted[1].payload as { partial: boolean }).partial).toBe(false);

    const rows = await getMessages('user-wt-1', conversationId);
    expect(rows).not.toBeNull();
    expect(rows!.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hello Brittney persistence'],
      ['assistant', 'Hello world'],
    ]);

    const convos = await listConversations('user-wt-1', { scope: 'workspace:wt1' });
    expect(convos).toHaveLength(1);
    expect(convos[0].messageCount).toBe(2);
    // Auto-titled from the first user message.
    expect(convos[0].title).toContain('Hello Brittney persistence');
  });

  it('appends to an existing owned conversation by id', async () => {
    mockSession('user-wt-2');
    const convo = await createConversation('user-wt-2', 'workspace:wt2');
    h.chunks.push(...textChunks('answer'));

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'question' }],
        conversationId: convo.id,
      })
    );
    const events = await readEvents(res);

    const convoEvent = events.find((e) => e.type === 'conversation');
    expect((convoEvent!.payload as { created: boolean }).created).toBe(false);
    expect((convoEvent!.payload as { conversationId: string }).conversationId).toBe(convo.id);

    const rows = await getMessages('user-wt-2', convo.id);
    expect(rows!.map((m) => [m.seq, m.role])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
    ]);

    const convos = await listConversations('user-wt-2', { scope: 'workspace:wt2' });
    expect(convos).toHaveLength(1);
  });

  it('silently skips persistence for a conversation the caller does not own', async () => {
    const foreign = await createConversation('other-user', 'workspace:wt3');
    mockSession('user-wt-3');
    h.chunks.push(...textChunks('still streams fine'));

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'probe' }],
        conversationId: foreign.id,
      })
    );
    const events = await readEvents(res);

    expect(events.find((e) => e.type === 'conversation')).toBeUndefined();
    expect(events.find((e) => e.type === 'persisted')).toBeUndefined();
    // Chat unaffected — the text still streamed.
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(0);
    // Nothing was written into the foreign conversation.
    const rows = await getMessages('other-user', foreign.id);
    expect(rows).toHaveLength(0);
  });

  it('does not persist anything when no conversation identity is sent', async () => {
    mockSession('user-wt-4');
    h.chunks.push(...textChunks('plain turn'));

    const res = await POST(chatReq({ messages: [{ role: 'user', content: 'hi' }] }));
    const events = await readEvents(res);

    expect(events.find((e) => e.type === 'conversation')).toBeUndefined();
    const maps = globalThis as { __brittneyConversations__?: Map<string, unknown> };
    expect(maps.__brittneyConversations__!.size).toBe(0);
    expect(events.find((e) => e.type === 'done')).toBeDefined();
  });

  it('persists the partial transcript when the provider dies mid-stream', async () => {
    mockSession('user-wt-5');
    h.chunks.push({ type: 'text_delta', text: 'partial answer' }, { __throw: 'provider exploded' });

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'crash case' }],
        scope: 'workspace:wt5',
      })
    );
    const events = await readEvents(res);

    expect(events.find((e) => e.type === 'error')).toBeDefined();
    const assistantAck = events.find(
      (e) => e.type === 'persisted' && (e.payload as { role: string }).role === 'assistant'
    );
    expect(assistantAck).toBeDefined();
    expect((assistantAck!.payload as { partial: boolean }).partial).toBe(true);

    const convos = await listConversations('user-wt-5', { scope: 'workspace:wt5' });
    const rows = await getMessages('user-wt-5', convos[0].id);
    expect(rows!.map((m) => [m.role, m.content])).toEqual([
      ['user', 'crash case'],
      ['assistant', 'partial answer'],
    ]);
  });

  it('persists tool calls on the assistant turn (client-side tool, no result)', async () => {
    mockSession('user-wt-6');
    h.chunks.push(
      { type: 'text_delta', text: 'Using a tool' },
      { type: 'tool_use_start', id: 't1', name: 'client_demo_tool' },
      { type: 'tool_use_end', id: 't1', input: { x: 1 } },
      { type: 'message_stop', finishReason: 'tool_use' }
    );

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'use the tool' }],
        scope: 'workspace:wt6',
      })
    );
    await readEvents(res);

    const convos = await listConversations('user-wt-6', { scope: 'workspace:wt6' });
    const rows = await getMessages('user-wt-6', convos[0].id);
    const assistant = rows!.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant!.toolCalls).toEqual([{ id: 't1', name: 'client_demo_tool', input: { x: 1 } }]);
  });

  it('bounds persisted content and clips oversized tool inputs (direct store call)', async () => {
    mockSession('user-wt-8');
    const MAX_CONTENT = 128 * 1024;
    h.chunks.push(
      { type: 'text_delta', text: 'z'.repeat(MAX_CONTENT + 500) },
      { type: 'tool_use_start', id: 't1', name: 'client_demo_tool' },
      { type: 'tool_use_end', id: 't1', input: { source: 'y'.repeat(5000) } },
      { type: 'message_stop', finishReason: 'tool_use' }
    );

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'big turn' }],
        scope: 'workspace:wt8',
      })
    );
    await readEvents(res);

    const convos = await listConversations('user-wt-8', { scope: 'workspace:wt8' });
    const rows = await getMessages('user-wt-8', convos[0].id);
    const assistant = rows!.find((m) => m.role === 'assistant')!;
    expect(assistant.content.length).toBe(MAX_CONTENT);
    const call = assistant.toolCalls[0] as { input: unknown; inputClipped?: boolean };
    expect(typeof call.input).toBe('string');
    expect((call.input as string).length).toBe(2000);
    expect(call.inputClipped).toBe(true);
  });

  it('feeds past threads from the same scope into the system prompt (D.053)', async () => {
    mockSession('user-wt-7');
    const threadA = await createConversation('user-wt-7', 'workspace:wt7');
    await appendMessages('user-wt-7', threadA.id, [
      { role: 'user', content: 'Discussed the solar panel layout for the rooftop scene' },
      { role: 'assistant', content: 'We placed twelve panels with a 30 degree tilt.' },
    ]);
    const active = await createConversation('user-wt-7', 'workspace:wt7');
    await appendMessages('user-wt-7', active.id, [
      { role: 'user', content: 'Beta thread opening question xyz' },
    ]);
    h.chunks.push(...textChunks('continuity answer'));

    const res = await POST(
      chatReq({
        messages: [{ role: 'user', content: 'what did we plan earlier?' }],
        conversationId: active.id,
      })
    );
    await readEvents(res);

    expect(h.captured.length).toBeGreaterThan(0);
    const systemMessage = h.captured[0].messages[0];
    expect(systemMessage.role).toBe('system');
    const prompt = String(systemMessage.content);
    expect(prompt).toContain('--- Past Conversations (relational memory) ---');
    // Thread A (the OTHER thread) is summarized…
    expect(prompt).toContain('Discussed the solar panel layout');
    // …but the ACTIVE thread is excluded from its own recall block.
    expect(prompt).not.toContain('Beta thread opening question xyz');
  });
});
