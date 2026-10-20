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
 * raised eight frontier models' pooled right answers from 181 to 286 of 336 (right shape only:
 * 227 to 317; see the comment on HOLOSCRIPT_EXAMPLE_PROGRAM). These tests keep that program in the prompt and
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

  // Graded on every requested detail, models shown only the example missed forms it
  // never shows (2026-10-08, ai-ecosystem receipts/holotune-native-authoring/
  // 2026-10-08-generator-prompt-detail-regrade.json). These are shown now.
  it('shows the forms models missed, each in a spelling the parser keeps', () => {
    // An object made from a template.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).toMatch(/^ +object "[^"]+" using "[^"]+" \{$/m);
    // A group placed with position: (what the language guide and the compilers use).
    expect(HOLOSCRIPT_SYSTEM_PROMPT).toMatch(/^ +spatial_group "[^"]+" \{\n +position: \[/m);
    // A comment line directly above an object.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).toMatch(/^ +\/\/ [^\n]+\n +object "/m);
    // A state transition, one field per line.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).toMatch(
      /transitions: \[\n +\{\n +target: "[^"]+"\n +event: "[^"]+"\n +\}/
    );
  });

  it('teaches no spelling the language does not define or the parser drops', () => {
    // Group `origin:` is read by no web compiler; the guide places a group with position:.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/\borigin:/);
    // A `trigger "x" { }` block parses only as an unknown named block, and `@on_event`
    // is not a trait core declares (board task_1791522939238_jbhj).
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/^\s*trigger "/m);
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/@on_event\b/);
    // A state's `on: { event: "next" }` parses and keeps no transition.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/\bon: \{/);
    // A template's behavior block keeps its name and drops its fields until the .holo
    // reader keeps block bodies (HoloScript claude9/holo-keeps-what-it-reads); show one
    // only after that lands.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/^\s*behavior "/m);
    // A named material (`material: "stone"`, `material "X" @advanced_pbr { }`) is dropped
    // on threejs and r3f and the object renders white (measured with
    // `holoscript compile --target r3f`, c76223725); the prompt teaches color, roughness
    // and metallic as properties instead. The `material "X" {` block is also refused
    // in .hsplus.
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/\bmaterial:\s*"/);
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/^\s*material "/m);
    expect(HOLOSCRIPT_SYSTEM_PROMPT).not.toMatch(/@advanced_pbr\b/);
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

  it.each([
    ['a comment that mentions an object', '// object "Nothing" here\nhello world'],
    ['an empty composition', 'composition "Empty" {\n}'],
    ['a material alone', 'material "Only" {}'],
  ])("does not count %s as an object (the adapter's own check)", async (_label, reply) => {
    const adapter = new MockAdapter();
    capture(adapter, reply);

    const result = await adapter.generateHoloScript({ prompt: 'x' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No recognized HoloScript object types found');
  });

  it('still lets a request bring its own system prompt', async () => {
    const adapter = new MockAdapter();
    const seen = capture(adapter, HOLOSCRIPT_EXAMPLE_PROGRAM);

    await adapter.generateHoloScript({ prompt: 'x', systemPrompt: 'custom' });

    expect(seen[0].messages[0]).toEqual({ role: 'system', content: 'custom' });
  });
});
