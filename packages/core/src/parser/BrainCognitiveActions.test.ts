import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import type { HoloBrainDecl } from './HoloScriptPlusParser';

/**
 * Verifies that cognitive verbs authored inside a `brain` state parse into TYPED
 * cognitive-action AST nodes (not opaque free-form action strings) — the
 * language-level change that makes the real cognitive traits reachable.
 */
describe('HoloScriptPlusParser — cognitive brain actions', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  function parseBrain(source: string): HoloBrainDecl {
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const root = result.ast.root as unknown as HoloBrainDecl;
    expect(root.type).toBe('brain');
    return root;
  }

  it('parses llm_call / recall as typed cognitive actions inside a state', () => {
    const brain = parseBrain(`
      brain PlannerAI : @behavior_tree {
        @personality helpful
        state thinking {
          llm_call { prompt: "What should I do next?", model: "qwen3.5:4b" }
          recall { query: "prior plans", limit: 5 }
          transition to acting @when { plan_ready }
        }
      }
    `);

    const thinking = brain.states.find((s) => s.name === 'thinking');
    expect(thinking).toBeDefined();
    const cog = thinking!.cognitiveActions;
    expect(cog).toBeDefined();
    expect(cog!.map((c) => c.verb)).toEqual(['llm_call', 'recall']);

    expect(cog![0].kind).toBe('cognitive');
    expect(cog![0].config.prompt).toBe('What should I do next?');
    expect(cog![0].config.model).toBe('qwen3.5:4b');
    expect(cog![1].config.query).toBe('prior plans');
    expect(cog![1].config.limit).toBe(5);

    // The transition is still parsed normally alongside the cognitive actions.
    expect(thinking!.transitions.some((t) => t.to === 'acting')).toBe(true);
  });

  it('parses all five cognitive verbs', () => {
    const brain = parseBrain(`
      brain FullAgent {
        state cognition {
          llm_call { prompt: "p" }
          recall { query: "q" }
          rag_query { query: "doc" }
          plan { state: { ready: true } }
          reflect { of: "last step", criteria: "correctness" }
        }
      }
    `);
    const cognition = brain.states.find((s) => s.name === 'cognition');
    expect(cognition!.cognitiveActions!.map((c) => c.verb)).toEqual([
      'llm_call',
      'recall',
      'rag_query',
      'plan',
      'reflect',
    ]);
  });

  it('does not misclassify a non-cognitive identifier as a cognitive action', () => {
    const brain = parseBrain(`
      brain LegacyAI {
        state idle {
          patrol waypoints
          wander slowly
        }
      }
    `);
    const idle = brain.states.find((s) => s.name === 'idle');
    // No cognitive verbs here → free-form actions preserved, no cognitiveActions.
    expect(idle!.cognitiveActions).toBeUndefined();
    expect(idle!.actions.length).toBeGreaterThan(0);
  });

  it('treats a bare cognitive verb with no config block as a free-form action', () => {
    const brain = parseBrain(`
      brain BareAI {
        state s {
          plan ahead carefully
        }
      }
    `);
    const s = brain.states.find((st) => st.name === 's');
    // `plan` here is not followed by `{` → falls back to free-form, not cognitive.
    expect(s!.cognitiveActions).toBeUndefined();
    expect(s!.actions.some((a) => a.includes('plan'))).toBe(true);
  });
});
