/**
 * AnthropicAdapter — prompt caching toggle
 *
 * Verifies that `enablePromptCaching` correctly toggles the system-prompt
 * shape sent to client.messages.stream():
 *   - true (DEFAULT) → `system` is `[{type:"text", text, cache_control:{type:"ephemeral"}}]`,
 *     which (per the API render order tools→system→messages) caches BOTH
 *     tools AND system as a single prefix the agent runner reuses every tick.
 *   - false (explicit opt-out) → `system` is a plain string (no caching),
 *     for callers with measured pathological prompt patterns.
 *
 * Honors GOLD entries:
 *  - G.GOLD.013: assert the explicit-false case explicitly. After the
 *    2026-04-26 default-flip, opt-out becomes the regression risk: if the
 *    explicit-false path silently kept caching, callers who measured a
 *    pathology and asked to opt out would still pay the cache-write
 *    premium without their consent.
 *  - G.GOLD.015: this test exists to catch a regression that would have
 *    already shipped silently — both the agent runner running with caching
 *    accidentally OFF (paying ~10× more per tick) AND the inverse, an
 *    opt-out caller silently still being cached.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state so we can inspect what client.messages.stream() saw.
// vi.hoisted() runs BEFORE vi.mock(), so the closure variable is in scope
// when the mock factory captures it.
const { streamCalls } = vi.hoisted(() => ({ streamCalls: [] as Array<Record<string, unknown>> }));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages = {
      stream: (args: Record<string, unknown>) => {
        streamCalls.push(args);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 10, output_tokens: 5 },
            model: (args.model as string) ?? 'claude-opus-4-7',
            stop_reason: 'end_turn',
          }),
          get request_id() { return 'req_caching_test'; },
          get response() { return { headers: new Headers() }; },
        };
      },
    };
    constructor(_config: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockAnthropic };
});

// Import AFTER vi.mock so the dynamic import inside complete() resolves
// to the mocked module.
import { AnthropicAdapter } from '../adapters/anthropic';

describe('AnthropicAdapter prompt caching', () => {
  beforeEach(() => {
    streamCalls.length = 0;
  });

  it('default config: system is array form with ephemeral cache_control on the last block (caching ON by default)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'You are a HoloScript code generator.' },
        { role: 'user', content: 'Generate a cube scene.' },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];
    // After 2026-04-26 default flip, caching is ON by default — every
    // call ships `system` in array form with cache_control. This pins
    // the new default; if anyone reverts to false silently this fails.
    expect(Array.isArray(args.system)).toBe(true);
    const systemArr = args.system as Array<{ type: string; text: string; cache_control?: { type: string } }>;
    expect(systemArr).toHaveLength(1);
    expect(systemArr[0].text).toBe('You are a HoloScript code generator.');
    expect(systemArr[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('enablePromptCaching=true (explicit): same shape as default — system is array form with ephemeral cache_control', async () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: true,
    });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'You are a security-auditor brain.' },
        { role: 'user', content: 'Audit this codebase.' },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];
    expect(Array.isArray(args.system)).toBe(true);
    const systemArr = args.system as Array<{ type: string; text: string; cache_control?: { type: string } }>;
    expect(systemArr).toHaveLength(1);
    expect(systemArr[0].type).toBe('text');
    expect(systemArr[0].text).toBe('You are a security-auditor brain.');
    expect(systemArr[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('enablePromptCaching=true with empty system: system is undefined (no array wrapping nothing)', async () => {
    // Edge case: a request with NO system message. The adapter shouldn't
    // construct a [{text: "", cache_control: ...}] block — that's a wasted
    // breakpoint and adds 1.25× cost on a zero-token prefix.
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: true,
    });
    await adapter.complete({
      messages: [{ role: 'user', content: 'Hello.' }],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];
    expect(args.system).toBeUndefined();
  });

  it('enablePromptCaching=false explicit: opts OUT of new default — system is plain string with no cache_control', async () => {
    // Critical inverse-regression assertion (G.GOLD.013 + G.GOLD.015).
    // After the 2026-04-26 default flip, the explicit-false opt-out is the
    // load-bearing path: it's how a caller with measured pathological
    // prompt patterns (varied above-minimum prefixes that never repeat)
    // escapes the cache-write premium. If the adapter silently kept
    // caching when explicitly opted out, that caller would still pay the
    // 1.25× write premium without their consent. This test guards that.
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: false,
    });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'You are a HoloScript generator.' },
        { role: 'user', content: 'Generate.' },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];
    expect(typeof args.system).toBe('string');
    expect(args.system).toBe('You are a HoloScript generator.');
    // The opt-out invariant: nothing remotely resembling cache_control is
    // present anywhere in what gets sent to client.messages.stream().
    expect(JSON.stringify(args.system)).not.toContain('cache_control');
  });

  it('enablePromptCaching=true preserves tools alongside cached system', async () => {
    // When the agent runner sets caching on, the prefix being cached is
    // tools + system together (render order: tools → system → messages).
    // This test pins that tools still pass through correctly when the
    // system field shape changes.
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: true,
    });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'Brain composition.' },
        { role: 'user', content: 'Run audit.' },
      ],
      tools: [
        {
          name: 'read_file',
          description: 'Read a file from disk.',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];
    expect(Array.isArray(args.system)).toBe(true);
    expect(Array.isArray(args.tools)).toBe(true);
    expect((args.tools as Array<{ name: string }>)[0].name).toBe('read_file');
  });

  // ── Extended prompt caching: message-turn breakpoints ──────────────
  // Anthropic API allows max 4 cache_control breakpoints per request.
  // One is always used for the system prefix; the remaining 3 are placed
  // on the last content block of assistant turns, most-recent first.

  it('extended caching: places cache_control on recent assistant turns (budget=4, system+3 turns)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', enablePromptCaching: true });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'System prompt.' },
        { role: 'user', content: 'Turn 1 user' },
        { role: 'assistant', content: 'Turn 1 assistant' },
        { role: 'user', content: 'Turn 2 user' },
        { role: 'assistant', content: 'Turn 2 assistant' },
        { role: 'user', content: 'Turn 3 user' },
        { role: 'assistant', content: 'Turn 3 assistant' },
        { role: 'user', content: 'Turn 4 user' },
        { role: 'assistant', content: 'Turn 4 assistant' },
        { role: 'user', content: 'Final question' },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];

    // System breakpoint
    expect(Array.isArray(args.system)).toBe(true);
    const systemArr = args.system as Array<{ cache_control?: { type: string } }>;
    expect(systemArr[0].cache_control).toEqual({ type: 'ephemeral' });

    // Messages: budget=4-1=3 for message turns. 4 assistant turns, 3 most recent cached.
    const msgs = args.messages as Array<Record<string, unknown>>;
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');

    // 4 assistant turns total
    expect(assistantMsgs).toHaveLength(4);

    // The 3 most recent (Turn 2, 3, 4) should have cache_control
    // Turn 1 (oldest) should NOT have cache_control (budget exhausted)
    const turn1Content = assistantMsgs[0].content;
    const turn2Content = assistantMsgs[1].content;
    const turn3Content = assistantMsgs[2].content;
    const turn4Content = assistantMsgs[3].content;

    // Turn 1 (oldest) — no cache_control (budget used on newer turns)
    expect(JSON.stringify(turn1Content)).not.toContain('cache_control');
    // Turns 2-4 — have cache_control on their content
    expect(JSON.stringify(turn2Content)).toContain('cache_control');
    expect(JSON.stringify(turn3Content)).toContain('cache_control');
    expect(JSON.stringify(turn4Content)).toContain('cache_control');
  });

  it('extended caching: single assistant turn gets cache breakpoint', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', enablePromptCaching: true });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ],
    });

    const args = streamCalls[0];
    const msgs = args.messages as Array<Record<string, unknown>>;
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');

    expect(assistantMsgs).toHaveLength(1);
    // The single assistant turn should have cache_control
    expect(JSON.stringify(assistantMsgs[0].content)).toContain('cache_control');
  });

  it('extended caching: no assistant turns = no message breakpoints (system still cached)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', enablePromptCaching: true });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'System prompt.' },
        { role: 'user', content: 'Just a question.' },
      ],
    });

    const args = streamCalls[0];
    // System still cached
    expect(Array.isArray(args.system)).toBe(true);
    // No cache_control on any message (no assistant turns)
    const msgs = args.messages as Array<Record<string, unknown>>;
    expect(JSON.stringify(msgs)).not.toContain('cache_control');
  });

  it('extended caching: respects maxCacheBreakpoints=1 (system only, no message breakpoints)', async () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: true,
      maxCacheBreakpoints: 1,
    });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'System prompt.' },
        { role: 'user', content: 'Turn 1 user' },
        { role: 'assistant', content: 'Turn 1 assistant' },
        { role: 'user', content: 'Turn 2 user' },
      ],
    });

    const args = streamCalls[0];
    // System breakpoint used the only slot
    expect(Array.isArray(args.system)).toBe(true);
    // No message breakpoints — budget=1-1=0 for messages
    const msgs = args.messages as Array<Record<string, unknown>>;
    expect(JSON.stringify(msgs)).not.toContain('cache_control');
  });

  it('extended caching: maxCacheBreakpoints=2 reserves one message breakpoint', async () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: true,
      maxCacheBreakpoints: 2,
    });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'U3' },
      ],
    });

    const args = streamCalls[0];
    const msgs = args.messages as Array<Record<string, unknown>>;
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');

    // Budget = 2-1=1 for messages. Only the most recent assistant turn cached.
    expect(assistantMsgs).toHaveLength(2);
    // A1 (older) — no cache_control
    expect(JSON.stringify(assistantMsgs[0].content)).not.toContain('cache_control');
    // A2 (most recent) — has cache_control
    expect(JSON.stringify(assistantMsgs[1].content)).toContain('cache_control');
  });

  it('extended caching: structured content (tool_use) gets cache on LAST block', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', enablePromptCaching: true });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'Read file.txt' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read that file.' },
            { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'file.txt' } },
          ],
        },
        { role: 'user', content: 'What does it say?' },
      ],
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        },
      ],
    });

    const args = streamCalls[0];
    const msgs = args.messages as Array<Record<string, unknown>>;
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');

    expect(assistantMsgs).toHaveLength(1);
    const content = assistantMsgs[0].content as Array<Record<string, unknown>>;
    // Cache breakpoint should be on the LAST content block (tool_use)
    expect(content[0].type).toBe('text');
    expect(content[0]).not.toHaveProperty('cache_control');
    expect(content[1].type).toBe('tool_use');
    expect(content[1]).toHaveProperty('cache_control');
    expect((content[1] as Record<string, unknown>).cache_control).toEqual({ type: 'ephemeral' });
  });

  it('extended caching: caching=false disables ALL breakpoints including messages', async () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enablePromptCaching: false,
    });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'U2' },
      ],
    });

    const args = streamCalls[0];
    // No cache_control ANYWHERE — neither system nor messages
    expect(typeof args.system).toBe('string');
    expect(args.system).toBe('System.');
    const msgs = args.messages as Array<Record<string, unknown>>;
    expect(JSON.stringify(msgs)).not.toContain('cache_control');
  });
});
