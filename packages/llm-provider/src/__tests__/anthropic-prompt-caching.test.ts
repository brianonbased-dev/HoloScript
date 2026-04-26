/**
 * AnthropicAdapter — prompt caching opt-in
 *
 * Verifies that `enablePromptCaching` correctly toggles the system-prompt
 * shape sent to client.messages.stream():
 *   - false (default) → `system` is a plain string (legacy code-gen path).
 *   - true → `system` is `[{type:"text", text, cache_control:{type:"ephemeral"}}]`,
 *     which (per the API render order tools→system→messages) caches BOTH
 *     tools AND system as a single prefix the agent runner reuses every tick.
 *
 * Honors GOLD entries:
 *  - G.GOLD.013: assert the false case explicitly. The "default off" path is
 *    the historical behavior; if we accidentally flipped the default we'd
 *    silently start charging cache-write premiums on every code-gen request.
 *  - G.GOLD.015: this test exists to catch a regression that would have
 *    already shipped silently — i.e. the agent runner running with caching
 *    OFF (paying ~10× more per tick) and no error surfacing.
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

  it('default config: system field is a plain string (no cache_control)', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    await adapter.complete({
      messages: [
        { role: 'system', content: 'You are a HoloScript code generator.' },
        { role: 'user', content: 'Generate a cube scene.' },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    const args = streamCalls[0];
    // System is sent as a string — adapter's pre-caching shape.
    expect(typeof args.system).toBe('string');
    expect(args.system).toBe('You are a HoloScript code generator.');
    // Negative assertion (G.GOLD.013): no cache_control anywhere on system
    expect(JSON.stringify(args.system)).not.toContain('cache_control');
  });

  it('enablePromptCaching=true: system is array form with ephemeral cache_control on the last block', async () => {
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
    // The point of this whole feature: cache_control on the last system block.
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

  it('enablePromptCaching=false explicit: behaves identically to default', async () => {
    // Defensive — if someone explicitly sets `enablePromptCaching: false`
    // (e.g. wiring through env-driven config), the adapter must not silently
    // upgrade them to caching.
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
