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
const { streamCalls, mockUsage, cacheSim, mockResponseExtras, streamOptionsCalls } = vi.hoisted(
  () => ({
    streamCalls: [] as Array<Record<string, unknown>>,
    // Mutable so the cache-telemetry tests can drive what the SDK reports back.
    // Reset to the default shape in beforeEach; every other test relies on it.
    mockUsage: { current: { input_tokens: 10, output_tokens: 5 } as Record<string, number> },
    // Opt-in prefix-match cache simulation for the hit-rate smoke test.
    cacheSim: { enabled: false, seen: new Set<string>() },
    // Extra top-level fields spliced onto the mock response (e.g. `diagnostics`).
    mockResponseExtras: { current: {} as Record<string, unknown> },
    // Second argument to stream() — carries the `anthropic-beta` header and the
    // abort signal. Beta tokens are NOT in the body, so they must be inspected
    // here rather than in `streamCalls`.
    streamOptionsCalls: [] as Array<Record<string, unknown> | undefined>,
  })
);

vi.mock('@anthropic-ai/sdk', () => {
  /**
   * Stand-in for Anthropic's prefix-match caching, used only by the hit-rate
   * smoke test (`cacheSim.enabled`). Everything else gets `mockUsage.current`
   * verbatim.
   *
   * The cached prefix is `tools → system`, so the simulation keys on exactly
   * those bytes and only counts a hit when a `cache_control` breakpoint was
   * actually sent. That makes the smoke test fail for BOTH real-world causes
   * of a dead cache: the adapter silently ceasing to emit breakpoints, and
   * the prefix bytes varying between otherwise-identical calls.
   */
  function simulateUsage(args: Record<string, unknown>): Record<string, number> {
    const usage = { ...mockUsage.current };
    if (!cacheSim.enabled) return usage;

    const hasBreakpoint = JSON.stringify(args.system ?? null).includes('cache_control');
    if (!hasBreakpoint) return usage;

    const prefixKey = JSON.stringify([args.tools ?? null, args.system ?? null]);
    if (cacheSim.seen.has(prefixKey)) {
      return { ...usage, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 };
    }
    cacheSim.seen.add(prefixKey);
    return { ...usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000 };
  }

  class MockAnthropic {
    public readonly messages = {
      stream: (args: Record<string, unknown>, options?: Record<string, unknown>) => {
        streamCalls.push(args);
        streamOptionsCalls.push(options);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            usage: simulateUsage(args),
            model: (args.model as string) ?? 'claude-opus-4-7',
            stop_reason: 'end_turn',
            ...mockResponseExtras.current,
          }),
          get request_id() {
            return 'req_caching_test';
          },
          get response() {
            return { headers: new Headers() };
          },
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
    streamOptionsCalls.length = 0;
    mockUsage.current = { input_tokens: 10, output_tokens: 5 };
    cacheSim.enabled = false;
    cacheSim.seen.clear();
    mockResponseExtras.current = {};
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
    const systemArr = args.system as Array<{
      type: string;
      text: string;
      cache_control?: { type: string };
    }>;
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
    const systemArr = args.system as Array<{
      type: string;
      text: string;
      cache_control?: { type: string };
    }>;
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
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
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

  /**
   * Cache telemetry — `mapUsage()`.
   *
   * Regression guard for the accounting bug these tests close: Anthropic's
   * `input_tokens` is ONLY the uncached remainder, so the old
   * `input_tokens + output_tokens` sum silently dropped the entire cached
   * prefix. The error scaled with cache hit rate — totals were most wrong
   * exactly when caching worked best.
   *
   * `complete()` and `streamCompletion()` share `mapUsage()`, so these cover
   * both paths.
   */
  it('cache telemetry: a cache READ is folded into promptTokens and surfaced separately', async () => {
    mockUsage.current = {
      input_tokens: 12,
      output_tokens: 7,
      cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 0,
    };
    const res = await new AnthropicAdapter({ apiKey: 'test-key' }).complete({
      messages: [
        { role: 'system', content: 'Stable system prefix.' },
        { role: 'user', content: 'Tick.' },
      ],
    });

    // 12 uncached + 4000 read = 4012. The pre-fix code reported 12.
    expect(res.usage.promptTokens).toBe(4012);
    expect(res.usage.totalTokens).toBe(4019);
    expect(res.usage.cacheReadTokens).toBe(4000);
    expect(res.usage.cacheWriteTokens).toBe(0);
  });

  it('cache telemetry: a cache WRITE is folded in and surfaced separately', async () => {
    mockUsage.current = {
      input_tokens: 12,
      output_tokens: 7,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 5120,
    };
    const res = await new AnthropicAdapter({ apiKey: 'test-key' }).complete({
      messages: [
        { role: 'system', content: 'Stable system prefix.' },
        { role: 'user', content: 'Cold cache.' },
      ],
    });

    expect(res.usage.promptTokens).toBe(5132);
    // Callers must price this at the write premium, not base input.
    expect(res.usage.cacheWriteTokens).toBe(5120);
  });

  it('cache telemetry: absent cache fields default to 0 without NaN-ing totals', async () => {
    mockUsage.current = { input_tokens: 10, output_tokens: 5 };
    const res = await new AnthropicAdapter({ apiKey: 'test-key' }).complete({
      messages: [{ role: 'user', content: 'No caching.' }],
    });

    expect(res.usage.promptTokens).toBe(10);
    expect(res.usage.totalTokens).toBe(15);
    expect(res.usage.cacheReadTokens).toBe(0);
    expect(Number.isNaN(res.usage.totalTokens)).toBe(false);
  });

  /** TTL selection — `promptCacheTtl`. */
  const ttlOf = (call: Record<string, unknown>) =>
    (call.system as Array<{ cache_control?: { type: string; ttl?: string } }>)[0].cache_control;

  it('ttl: defaults to 5m, expressed by OMITTING ttl (keeps prefix bytes stable)', async () => {
    await new AnthropicAdapter({ apiKey: 'test-key' }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U' },
      ],
    });
    // Sending `ttl: '5m'` would be semantically identical but would change the
    // serialized prefix, invalidating entries written by a previous build.
    expect(ttlOf(streamCalls[0])).toEqual({ type: 'ephemeral' });
  });

  it('ttl: 1h applies uniformly to system AND message breakpoints', async () => {
    // Uniformity matters: the API requires 1h breakpoints to precede 5m ones,
    // and a single TTL per request makes that unorderable.
    await new AnthropicAdapter({ apiKey: 'test-key', promptCacheTtl: '1h' }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'U2' },
      ],
    });

    const breakpoints = JSON.stringify(streamCalls[0]).match(/"cache_control":\{[^}]*\}/g) ?? [];
    expect(breakpoints.length).toBeGreaterThan(1);
    for (const bp of breakpoints) expect(bp).toContain('"ttl":"1h"');
  });

  /**
   * Cache hit-rate smoke test — closes the open item from
   * docs/strategy/claude-api-migration-checklist.md. Previously impossible to
   * write: the adapter discarded the counters, so there was nothing to assert.
   */
  it('smoke: 10 consecutive identical-prefix calls yield a non-zero hit rate', async () => {
    cacheSim.enabled = true;
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const system = 'You are a HoloScript code generator. '.repeat(200);
    const reads: number[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await adapter.complete({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Request ${i}` },
        ],
      });
      reads.push(res.usage.cacheReadTokens ?? 0);
    }

    expect(reads[0]).toBe(0); // first call writes
    expect(reads.slice(1).every((r) => r > 0)).toBe(true);
    expect(reads.filter((r) => r > 0).length / reads.length).toBeGreaterThanOrEqual(0.9);
  });

  it('smoke: a varying system prefix produces a zero hit rate (guards the guard)', async () => {
    // Proves the smoke test above can actually fail. This is the exact
    // silent-invalidator shape — a per-request value inside the cached prefix.
    cacheSim.enabled = true;
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const reads: number[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await adapter.complete({
        messages: [
          { role: 'system', content: `You are a generator. Request id: ${i}` },
          { role: 'user', content: 'Same question every time.' },
        ],
      });
      reads.push(res.usage.cacheReadTokens ?? 0);
    }

    expect(reads.every((r) => r === 0)).toBe(true);
  });

  /** Cache diagnostics — request shape and response mapping only. */
  it('diagnostics: off by default — no beta token, no diagnostics body field', async () => {
    await new AnthropicAdapter({ apiKey: 'test-key' }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U' },
      ],
    });
    expect(streamCalls[0]).not.toHaveProperty('diagnostics');
    // Single-arg stream() call on the common path preserves the literal-object
    // request shape the 30s-wall comment in complete() depends on.
    expect(streamOptionsCalls[0]).toBeUndefined();
  });

  it('diagnostics: emits the beta token (header) and previous_message_id (body)', async () => {
    await new AnthropicAdapter({ apiKey: 'test-key' }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U' },
      ],
      provider: { anthropic: { cacheDiagnostics: { previousMessageId: 'msg_prev_123' } } },
    });

    // Both halves are required — body field alone is a 400, header alone a no-op.
    const headers = streamOptionsCalls[0]?.headers as Record<string, string> | undefined;
    expect(headers?.['anthropic-beta']).toContain('cache-diagnosis-2026-04-07');
    expect(JSON.stringify(streamCalls[0])).toContain('"previous_message_id":"msg_prev_123"');
  });

  it('diagnostics: surfaces cache_miss_reason, and collapses pending/empty to undefined', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    mockResponseExtras.current = {
      diagnostics: {
        cache_miss_reason: { type: 'system_changed', cache_missed_input_tokens: 41850 },
      },
    };
    const hit = await adapter.complete({
      messages: [{ role: 'user', content: 'U' }],
      provider: { anthropic: { cacheDiagnostics: { previousMessageId: 'msg_1' } } },
    });
    expect(hit.cacheMissReason).toEqual({
      type: 'system_changed',
      cacheMissedInputTokens: 41850,
    });

    // `{cache_miss_reason: null}` = still running; `diagnostics: null` = no
    // divergence. Neither is actionable, so neither should surface.
    for (const diagnostics of [null, { cache_miss_reason: null }]) {
      mockResponseExtras.current = { diagnostics };
      const res = await adapter.complete({
        messages: [{ role: 'user', content: 'U' }],
        provider: { anthropic: { cacheDiagnostics: { previousMessageId: 'msg_1' } } },
      });
      expect(res.cacheMissReason).toBeUndefined();
    }
  });

  /**
   * KVFlow-informed breakpoint placement.
   *
   * The pathology this fixes: recency spends the scarce budget on the most
   * RECENT assistant turns, which in an agent tool-loop are the most ephemeral
   * (`scene-turn`) content in the request — the least likely to ever be read
   * back. Hints let reuse value win instead.
   */
  const cachedAssistantTexts = (call: Record<string, unknown>) =>
    (call.messages as Array<{ role: string; content: unknown }>)
      .filter((m) => m.role === 'assistant' && JSON.stringify(m.content).includes('cache_control'))
      .map((m) => JSON.stringify(m.content));

  it('kvflow: without hints, breakpoints fall on the most RECENT assistant turns', async () => {
    await new AnthropicAdapter({ apiKey: 'test-key', maxCacheBreakpoints: 2 }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'OLD-STABLE' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: 'NEW-CHURN' },
        { role: 'user', content: 'U3' },
      ],
    });

    // budget = 2 - 1 (system) = 1 → legacy recency picks the newest turn.
    const cached = cachedAssistantTexts(streamCalls[0]);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toContain('NEW-CHURN');
  });

  it('kvflow: a shared-prefix hint outranks recency', async () => {
    await new AnthropicAdapter({ apiKey: 'test-key', maxCacheBreakpoints: 2 }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'OLD-STABLE' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: 'NEW-CHURN' },
        { role: 'user', content: 'U3' },
      ],
      provider: {
        anthropic: {
          cacheHints: [
            // Indices address request.messages (system INCLUDED) — index 2 is
            // OLD-STABLE, index 4 is NEW-CHURN.
            { messageIndex: 2, scope: 'shared-prefix', stepsToExecution: 1 },
            { messageIndex: 4, scope: 'scene-turn', stepsToExecution: 0 },
          ],
        },
      },
    });

    // Reuse value beats recency: the stable span keeps the single breakpoint.
    const cached = cachedAssistantTexts(streamCalls[0]);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toContain('OLD-STABLE');
    expect(cached[0]).not.toContain('NEW-CHURN');
  });

  it('kvflow: hint indices are translated across removed system messages', async () => {
    // The adapter strips system messages before building its own array, so a
    // caller-space index of 2 must land on the adapter-space assistant turn.
    // Getting this wrong is a silent off-by-one that caches the wrong span.
    await new AnthropicAdapter({ apiKey: 'test-key', maxCacheBreakpoints: 2 }).complete({
      messages: [
        { role: 'system', content: 'System A.' },
        { role: 'system', content: 'System B.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'TARGET' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: 'OTHER' },
      ],
      provider: {
        anthropic: {
          cacheHints: [{ messageIndex: 3, scope: 'shared-prefix', stepsToExecution: 0 }],
        },
      },
    });

    const cached = cachedAssistantTexts(streamCalls[0]);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toContain('TARGET');
  });

  it('kvflow: a hint aimed at a system message is dropped, falling back to recency', async () => {
    // Specified behaviour, not an accident: system content is covered by the
    // system+tools breakpoint, so there is no message turn to mark.
    await new AnthropicAdapter({ apiKey: 'test-key', maxCacheBreakpoints: 2 }).complete({
      messages: [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'OLD' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: 'NEW' },
      ],
      provider: {
        anthropic: { cacheHints: [{ messageIndex: 0, scope: 'shared-prefix' }] },
      },
    });

    const cached = cachedAssistantTexts(streamCalls[0]);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toContain('NEW');
  });
});
