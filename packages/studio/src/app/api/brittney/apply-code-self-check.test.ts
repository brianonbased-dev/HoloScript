/**
 * Brittney checks her own HoloScript before it reaches the editor.
 *
 * Until 2026-09-28, apply_code passed whatever the model wrote straight to the
 * browser. The viewport then failed to draw it, and the parse errors never went
 * back to her, so she could not repair it. Now the route runs her code through
 * the viewport's own pipeline: broken code is held back, the errors go to her as
 * the tool's result, and she repairs it in the same turn.
 *
 * The scripted provider below answers round by round: first broken code, then a
 * corrected scene.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rounds: [] as Array<Array<Record<string, unknown>>>,
  captured: [] as Array<{ messages: Array<{ role: string; content: unknown }> }>,
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
vi.mock('@/lib/brittney/provider', () => ({
  resolveBrittneyProvider: () => {
    throw new Error('sync resolve not used in tests');
  },
  resolveBrittneyProviderAsync: async () => ({
    provider: {
      streamCompletion: (request: { messages: Array<{ role: string; content: unknown }> }) => {
        h.captured.push(request);
        const items = h.rounds.shift() ?? [{ type: 'message_stop', finishReason: 'end_turn' }];
        return (async function* () {
          for (const c of items) yield c;
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
import { runScenePipeline } from '@/lib/scenePipeline';

const BROKEN = 'composition "Garden" {\n  object "Rose" {\n    geometry: "sphere"\n';
const FIXED =
  'composition "Garden" {\n  object "Rose" {\n    geometry: "sphere"\n    color: "#ff3366"\n  }\n}\n';

const applyCode = (id: string, code: string) => [
  { type: 'text_delta', text: 'Building your garden.' },
  { type: 'tool_use_start', id, name: 'apply_code' },
  { type: 'tool_use_end', id, input: { code } },
  { type: 'message_stop', finishReason: 'tool_use' },
];

function chatReq(body: unknown) {
  const text = JSON.stringify(body);
  return {
    headers: new Headers({ 'content-type': 'application/json', host: 'localhost:3000' }),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Parameters<typeof POST>[0];
}

async function readEvents(
  res: Response
): Promise<Array<{ type: string; payload: Record<string, unknown> }>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((line) => line.trim().length > 0)
    .map(
      (line) =>
        JSON.parse(line.replace(/^data: /, '')) as {
          type: string;
          payload: Record<string, unknown>;
        }
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  delete process.env.BRITTNEY_BENCHMARK_KEY;
  delete process.env.BRITTNEY_OPERATOR_TRANSPORT;
  h.rounds.length = 0;
  h.captured.length = 0;
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: 'user-self-check' },
  });
  (globalThis as { __brittneyConversations__?: Map<string, unknown> }).__brittneyConversations__ =
    new Map();
  (globalThis as { __brittneyMessages__?: Map<string, unknown> }).__brittneyMessages__ = new Map();
});

describe('apply_code is checked before it reaches the editor', () => {
  it('holds broken code back, tells Brittney why, and sends her repaired scene', async () => {
    h.rounds.push(applyCode('t1', BROKEN), applyCode('t2', FIXED));

    const events = await readEvents(
      await POST(chatReq({ messages: [{ role: 'user', content: 'Make me a rose garden' }] }))
    );

    // Only the repaired code reaches the browser as something to apply.
    const applied = events.filter((e) => e.type === 'tool_call' && e.payload.name === 'apply_code');
    expect(applied).toHaveLength(1);
    expect((applied[0].payload.arguments as { code: string }).code).toBe(FIXED);

    // The person sees that she is fixing it.
    const notice = events.find((e) => e.type === 'tool_result' && e.payload.name === 'apply_code');
    expect(notice?.payload.success).toBe(false);
    expect(String(notice?.payload.error)).toMatch(/Brittney is fixing it/);

    // She was told, in the next round, exactly why it was not applied: marked
    // as an error, and carrying the parser's own words, not just "it failed".
    // The words are taken from the viewport's pipeline directly, so a check
    // that swapped them for a stand-in could not agree with itself here.
    // The repaired apply_code then goes to the browser, which ends the request.
    expect(h.captured).toHaveLength(2);
    const toolResults = JSON.stringify(h.captured[1].messages.at(-1)?.content);
    expect(toolResults).toMatch(/could not draw this HoloScript/);
    expect(toolResults).toMatch(/"is_error":true/);
    const parserSays = runScenePipeline(BROKEN).errors[0]?.message ?? '';
    expect(parserSays.length).toBeGreaterThan(0);
    expect(toolResults).toContain(JSON.stringify(parserSays).slice(1, -1));
  });

  it('sends working code straight through, with no repair round', async () => {
    h.rounds.push(applyCode('t1', FIXED), [
      { type: 'text_delta', text: 'Done.' },
      { type: 'message_stop', finishReason: 'end_turn' },
    ]);

    const events = await readEvents(
      await POST(chatReq({ messages: [{ role: 'user', content: 'Make me a rose' }] }))
    );

    const applied = events.filter((e) => e.type === 'tool_call' && e.payload.name === 'apply_code');
    expect(applied).toHaveLength(1);
    expect(events.some((e) => e.type === 'tool_result' && e.payload.name === 'apply_code')).toBe(
      false
    );
    // A client-side tool ends the request: only one model round ran.
    expect(h.captured).toHaveLength(1);
  });

  it('refuses an apply_code call that carries no code at all', async () => {
    h.rounds.push(applyCode('t1', '   '), [
      { type: 'text_delta', text: 'Sorry, here is the scene.' },
      { type: 'message_stop', finishReason: 'end_turn' },
    ]);

    const events = await readEvents(
      await POST(chatReq({ messages: [{ role: 'user', content: 'Make me something' }] }))
    );

    expect(events.some((e) => e.type === 'tool_call' && e.payload.name === 'apply_code')).toBe(
      false
    );
    expect(JSON.stringify(h.captured[1].messages.at(-1)?.content)).toMatch(
      /without any HoloScript code/
    );
  });
});
