import { describe, it, expect } from 'vitest';
import { HOLOSCRIPT_SYSTEM_PROMPT, HOLOSCRIPT_EXAMPLE_PROGRAM } from '../index';
import { MockAdapter } from '../adapters/mock';
import { LocalLLMAdapter } from '../adapters/local-llm';
import { BitNetAdapter } from '../adapters/bitnet';
import type { BaseLLMAdapter } from '../base-adapter';
import type { LLMCompletionRequest, LLMCompletionResponse } from '../types';

/**
 * The prompt a model sees when it is asked to write HoloScript.
 *
 * Until 2026-10-07 it never showed the `composition "Name" { ... }` root that
 * every program needs, and its examples were root-less fragments; its placeholder
 * example parsed into a program with no objects at all. Showing one real program
 * is the largest measured improvement in authoring (frontier models 227 -> 317 of
 * 336, see the comment on HOLOSCRIPT_EXAMPLE_PROGRAM). These tests keep that program in the prompt and
 * keep it in front of every provider. Whether it PARSES is checked where the parser
 * lives: packages/mcp-server/src/__tests__/generator-prompt-parse.test.ts.
 */

/** Make `complete()` record the request and answer with `reply`, without a network call. */
function capture(adapter: BaseLLMAdapter, reply: string): LLMCompletionRequest[] {
  const seen: LLMCompletionRequest[] = [];
  adapter.complete = async (request: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
    seen.push(request);
    return {
      content: reply,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'test',
      provider: adapter.name,
      finishReason: 'stop',
    };
  };
  return seen;
}

describe('the prompt that asks a model to write HoloScript', () => {
  it('shows the composition root and one whole program, not a description of parts', () => {
    expect(HOLOSCRIPT_SYSTEM_PROMPT).toContain('composition "Name" {');
    expect(HOLOSCRIPT_SYSTEM_PROMPT).toContain(HOLOSCRIPT_EXAMPLE_PROGRAM);
    // The example is itself a whole program: one composition root at column 0 that
    // closes on the last line, with objects inside it.
    expect(HOLOSCRIPT_EXAMPLE_PROGRAM.match(/^composition "[^"]+" \{$/gm)).toHaveLength(1);
    expect(HOLOSCRIPT_EXAMPLE_PROGRAM.trimEnd().endsWith('\n}')).toBe(true);
    expect(HOLOSCRIPT_EXAMPLE_PROGRAM).toMatch(/^ {2}object "[^"]+" \{$/m);
  });

  it('teaches position as a property, never as the trait core does not declare', () => {
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/@(position|rotation|scale)\b/);
  });

  it.each([
    ['a cloud adapter', () => new MockAdapter()],
    ['the local-model adapter', () => new LocalLLMAdapter()],
    ['the BitNet adapter', () => new BitNetAdapter()],
  ])('is what %s sends to the model', async (_label, make) => {
    const adapter = make();
    const seen = capture(adapter, HOLOSCRIPT_EXAMPLE_PROGRAM);

    await adapter.generateHoloScript({ prompt: 'a red cube and a button' });

    expect(seen).toHaveLength(1);
    expect(seen[0].messages[0]).toEqual({ role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT });
  });

  it("marks a program written in the taught shape as valid (the adapter's own check)", async () => {
    const adapter = new MockAdapter();
    capture(adapter, HOLOSCRIPT_EXAMPLE_PROGRAM);

    const result = await adapter.generateHoloScript({ prompt: 'a red cube and a button' });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.detectedTraits).toEqual(
      expect.arrayContaining(['@grabbable', '@throwable', '@pointable', '@clickable'])
    );
  });

  it('still lets a request bring its own system prompt', async () => {
    const adapter = new MockAdapter();
    const seen = capture(adapter, HOLOSCRIPT_EXAMPLE_PROGRAM);

    await adapter.generateHoloScript({ prompt: 'x', systemPrompt: 'custom' });

    expect(seen[0].messages[0]).toEqual({ role: 'system', content: 'custom' });
  });
});
