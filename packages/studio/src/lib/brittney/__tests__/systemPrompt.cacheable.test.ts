import { describe, expect, it } from 'vitest';
import type { LLMMessage } from '@holoscript/llm-provider';
import {
  brittneyProviderMessages,
  buildContextualPrompt,
  buildStableSystemPrompt,
  buildTurnContext,
} from '../systemPrompt';

/**
 * Anthropic caches Brittney's whole system block as one prefix. When the live scene
 * sat inside it, every turn changed the block and missed the cache; the fixed
 * instructions (~15 KB) were re-billed on every message. The provider now gets a
 * stable system block and this turn's context on the newest user message.
 */
const SCENE_A = 'composition "zq-scene-one" { object "cube" { @grabbable } }';
const SCENE_B = 'composition "zq-scene-two" { object "ball" { @physics } }';
const GITHUB = { username: 'octo', repos: [] };

const turn = (scene: string) =>
  buildTurnContext(scene, null, { providerName: 'anthropic', model: 'm' }, GITHUB, []);

const history: LLMMessage[] = [
  { role: 'user', content: 'make a cube' },
  { role: 'assistant', content: 'done' },
  { role: 'user', content: 'now make it glow' },
];

describe('Brittney provider messages keep the system block cacheable', () => {
  it('sends a byte-identical system block for two different scenes', () => {
    const system = buildStableSystemPrompt(true, false);
    const a = brittneyProviderMessages(system, turn(SCENE_A), history);
    const b = brittneyProviderMessages(system, turn(SCENE_B), history);
    expect(a[0]).toEqual({ role: 'system', content: system });
    expect(b[0]).toEqual(a[0]);
    expect(String(a[0].content)).not.toContain(SCENE_A);
  });

  it("puts this turn's context on the newest user message only", () => {
    const system = buildStableSystemPrompt(true, false);
    const out = brittneyProviderMessages(system, turn(SCENE_A), history);
    const newest = String(out[3].content);
    expect(newest).toContain(SCENE_A);
    expect(newest).toContain('@octo');
    expect(newest.endsWith('now make it glow')).toBe(true);
    expect(newest.startsWith('--- Studio context for this turn')).toBe(true);
    expect(out[1]).toEqual(history[0]);
    expect(out[2]).toEqual(history[1]);
  });

  it("does not change the caller's messages, so the user's own words stay as typed", () => {
    const copy = JSON.parse(JSON.stringify(history));
    brittneyProviderMessages(buildStableSystemPrompt(), turn(SCENE_A), history);
    expect(history).toEqual(copy);
  });

  it('falls back to the old single system block when there is no user message', () => {
    const system = buildStableSystemPrompt();
    const ctx = turn(SCENE_A);
    const out = brittneyProviderMessages(system, ctx, [{ role: 'assistant', content: 'hi' }]);
    expect(out[0]).toEqual({ role: 'system', content: system + ctx });
  });

  it('adds nothing when there is no turn context (a client override)', () => {
    const out = brittneyProviderMessages('OVERRIDE', '', history);
    expect(out).toEqual([{ role: 'system', content: 'OVERRIDE' }, ...history]);
  });

  it('keeps buildContextualPrompt equal to stable + turn for its other callers', () => {
    expect(
      buildContextualPrompt(
        SCENE_A,
        null,
        true,
        { providerName: 'anthropic', model: 'm' },
        GITHUB,
        true,
        []
      )
    ).toBe(buildStableSystemPrompt(true, true) + turn(SCENE_A));
  });
});
