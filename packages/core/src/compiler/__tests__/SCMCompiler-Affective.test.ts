import { describe, it, expect, vi } from 'vitest';
import { SCMCompiler, AffectiveState } from '../SCMCompiler';
import type { HoloComposition } from '../../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('SCMCompiler - Affective Causality', () => {
  const mockComposition = {
    name: 'Affective_Causal_Scene',
    environment: { skybox: 'day', lighting: 'bright', properties: [] },
    objects: [
      {
        name: 'Agent_Player',
        traits: [{ name: 'ai_agent' }, { name: 'causal' }],
        properties: [{ key: 'health', value: 30 }],
      },
      {
        name: 'Distant_Decor',
        traits: [],
        properties: [{ key: 'color', value: 'green' }],
      },
    ],
    spatialGroups: [
      {
        name: 'Immediate_Danger_Zone',
        properties: [],
        objects: [
          {
            name: 'Enemy_Goblin',
            traits: [{ name: 'causal' }],
            properties: [{ key: 'aggro', value: true }],
          },
          {
            name: 'Pebble',
            traits: [],
            properties: [],
          },
        ],
      },
    ],
    templates: [],
  } as unknown as HoloComposition;

  it('should compile a full causal graph under calm conditions', () => {
    const calmState: AffectiveState = { valence: 0.5, arousal: 0.2, dominantEmotion: 'calm' };
    const compiler = new SCMCompiler({ affectiveContext: calmState });

    const resultJson = compiler.compile(mockComposition, 'test-token');
    const parsed = JSON.parse(resultJson);

    // Should include all nodes (Agent_Player, Distant_Decor, Enemy_Goblin, Pebble)
    expect(parsed.nodes).toHaveLength(4);

    // Edges from spatial groups (Immediate_Danger_Zone -> Enemy_Goblin, Immediate_Danger_Zone -> Pebble)
    expect(parsed.edges).toHaveLength(2);
  });

  it('should cull non-mechanism and low-weight edges under frustrated/anxious conditions (Tunnel Vision)', () => {
    const panicState: AffectiveState = { valence: -0.8, arousal: 0.9, dominantEmotion: 'anxious' };
    const compiler = new SCMCompiler({ affectiveContext: panicState });

    const resultJson = compiler.compile(mockComposition, 'test-token');
    const parsed = JSON.parse(resultJson);

    // Agent_Player (global), Distant_Decor (global), Enemy_Goblin (do_capable)
    // Pebble is not do_capable and not global, it should be filtered out natively.
    expect(parsed.nodes).toHaveLength(3);

    // Edges to culled nodes should be removed
    // Immediate_Danger_Zone -> Enemy_Goblin (Kept, target is do_capable)
    // Immediate_Danger_Zone -> Pebble (Culled, target is Pebble which is removed, or not do_capable)
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].target).toBe('Enemy_Goblin');
  });

  it('should artificially increase edge correlations under engaged conditions', () => {
    const engagedState: AffectiveState = { valence: 0.6, arousal: 0.6, dominantEmotion: 'engaged' };
    const compiler = new SCMCompiler({ affectiveContext: engagedState });

    const resultJson = compiler.compile(mockComposition, 'test-token');
    const parsed = JSON.parse(resultJson);

    expect(parsed.edges).toHaveLength(2);
    // Baseline weight is 1.0, engaged simulation bumps to 1.5
    expect(parsed.edges[0].weight).toBe(1.5);
    expect(parsed.edges[1].weight).toBe(1.5);
  });
});
