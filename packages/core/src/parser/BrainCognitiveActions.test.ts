import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HoloScriptPlusParser, preprocessAgentBrainSource } from './HoloScriptPlusParser';
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

  it('parses the checked-in HoloScript engineer through the explicit agent-brain contract', () => {
    const fixturePath = resolve(
      import.meta.dirname,
      '../../../holoscript-agent/src/brains/holoscript-engineer.hsplus'
    );
    const authored = readFileSync(fixturePath, 'utf8');
    const prepared = preprocessAgentBrainSource(authored);
    const result = parser.parse(prepared.source);

    expect(prepared.header).toEqual({
      brainName: 'HoloScriptEngineer',
      version: '6.0.0',
      targets: ['edge', 'mcp-server'],
    });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);

    const brain = result.ast.root as unknown as HoloBrainDecl;
    expect(brain.type).toBe('brain');
    expect(brain.identity).toMatchObject({
      domain: 'holoscript-language',
      capabilityTags: [
        'native_authoring',
        'trait_porting',
        'compiler_work',
        'rust_wasm',
        'language_design',
      ],
      requires: ['tools'],
    });
    expect(brain.traits.identity).toMatchObject({
      domain: 'holoscript-language',
      requires: ['tools'],
    });
    expect(brain.frameDeclaration).toMatchObject({
      domain: 'holoscript-language',
      capability_tier: 2,
      trust_tier: 2,
      allowed_tools: ['parse_hs', 'validate_holoscript'],
    });

    const onTask = brain.states.find((state) => state.name === 'on_task');
    expect(onTask?.cognitiveActions?.map((action) => action.verb)).toEqual([
      'recall',
      'rag_query',
      'llm_call',
      'reflect',
    ]);
  });

  it('rejects unsupported explicit-brain state syntax instead of dropping it', () => {
    const prepared = preprocessAgentBrainSource(`#brain StrictAgent
behavior on_task {
  ???
}`);
    const result = new HoloScriptPlusParser({ strict: true }).parse(prepared.source);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HSP109',
          message: expect.stringContaining('Unsupported token'),
        }),
      ])
    );
  });

  it('does not silently treat an unmarked document as an agent brain', () => {
    expect(() => preprocessAgentBrainSource('identity { domain: "ambiguous" }')).toThrow(
      /#brain <Identifier>/
    );
  });
});
