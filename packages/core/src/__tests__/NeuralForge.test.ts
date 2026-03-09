import { describe, it, expect, vi } from 'vitest';
import { neuralForgeHandler, NeuralShard } from '../traits/NeuralForgeTrait';

describe('Neural Forge (Phase 14)', () => {
  it('should auto-synthesize shards after threshold', () => {
    const node = { id: 'npc1', properties: {} };
    const context = { emit: vi.fn() } as any;
    const config = { ...neuralForgeHandler.defaultConfig, synthesis_threshold: 2 };

    neuralForgeHandler.onAttach!(node as any, config, context);

    // Interaction 1
    neuralForgeHandler.onEvent!(node as any, config, context, {
      type: 'npc_ai_response',
      text: 'Hello world',
    });

    // Interaction 2 (Threshold met)
    neuralForgeHandler.onEvent!(node as any, config, context, {
      type: 'npc_ai_response',
      text: 'I am learning',
    });

    expect(context.emit).toHaveBeenCalledWith(
      'neural_synthesis_request',
      expect.objectContaining({ node })
    );
    expect(context.emit).toHaveBeenCalledWith(
      'neural_shard_created',
      expect.objectContaining({
        shard: expect.objectContaining({ type: 'memory' }),
      })
    );
  });

  it('should absorb shards and evolve weights', () => {
    const node = { id: 'npc2', properties: {} };
    const context = { emit: vi.fn() } as any;
    const config = { ...neuralForgeHandler.defaultConfig };

    neuralForgeHandler.onAttach!(node as any, config, context);

    const shard: NeuralShard = {
      id: 'shard_test',
      sourceId: 'teacher',
      timestamp: Date.now(),
      type: 'personality',
      weight: 0.5,
      data: {
        modifiers: { openness: 0.2 }, // Should increase openness by 0.2 * 0.5 = 0.1
      },
    };

    const state = (node as any).__neuralState;
    const initialOpenness = state.weights.openness; // 0.5

    neuralForgeHandler.onEvent!(node as any, config, context, {
      type: 'neural_absorb_shard',
      shard,
    });

    expect(state.weights.openness).toBeCloseTo(initialOpenness + 0.1);
    expect(context.emit).toHaveBeenCalledWith('neural_cognition_evolved', expect.any(Object));
  });
});
