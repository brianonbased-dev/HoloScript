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
});
