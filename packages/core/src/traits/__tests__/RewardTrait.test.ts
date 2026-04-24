import { describe, it, expect } from 'vitest';
import rewardTraitHandler, { type RewardShapeConfig } from '../RewardTrait';

function createNode(id: string, position: [number, number, number]) {
  return { id, position } as any;
}

function createContext(overrides: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>();
  return {
    data: undefined,
    reactive: {
      set: (key: string, value: unknown) => values.set(key, value),
      get: (key: string) => values.get(key),
    },
    emit: () => {},
    getState: () => ({}),
    ...overrides,
  } as any;
}

function baseConfig(): RewardShapeConfig {
  return {
    events: [
      {
        type: 'distance',
        weight: 1,
        config: { targetObjectId: 'target-node', maxDist: 10 },
      },
    ],
    normalizeReward: true,
    decayFactor: 1,
    resetOnCollision: false,
    verbose: false,
  };
}

describe('RewardTrait distance target resolution', () => {
  it('uses physics.getBodyPosition(targetId) when available', () => {
    const node = createNode('agent', [0, 0, 0]);
    const cfg = baseConfig();
    const ctx = createContext({
      physics: {
        getBodyPosition: (id: string) => (id === 'target-node' ? [3, 4, 0] : null),
      },
    });

    rewardTraitHandler.onAttach?.(node, cfg, ctx);
    rewardTraitHandler.onUpdate?.(node, cfg, ctx, 1 / 60);

    expect(ctx.reactive.get('reward:signal')).toBeCloseTo(0.5, 5);
    expect(ctx.reactive.get('reward:accumulated')).toBeCloseTo(0.5, 5);
  });

  it('falls back to state.scene.nodes[targetId].position when physics is unavailable', () => {
    const node = createNode('agent', [0, 0, 0]);
    const cfg = baseConfig();
    const ctx = createContext({
      getState: () => ({
        scene: {
          nodes: {
            'target-node': { position: [0, 6, 8] },
          },
        },
      }),
    });

    rewardTraitHandler.onAttach?.(node, cfg, ctx);
    rewardTraitHandler.onUpdate?.(node, cfg, ctx, 1 / 60);

    // distance=10, maxDist=10 => 1 - 1 = 0
    expect(ctx.reactive.get('reward:signal')).toBeCloseTo(0, 5);
    expect(ctx.reactive.get('reward:accumulated')).toBeCloseTo(0, 5);
  });
});
