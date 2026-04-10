import { describe, it, expect, beforeEach } from 'vitest';
import { neuralForgeHandler } from '../NeuralForgeTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
} from './traitTestHelpers';

describe('NeuralForgeTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    auto_synthesize: true,
    synthesis_threshold: 3,
    base_weights: { openness: 0.5, extroversion: 0.5 },
  };

  beforeEach(() => {
    node = createMockNode('nf');
    ctx = createMockContext();
    attachTrait(neuralForgeHandler, node, cfg, ctx);
  });

  it('emits neural_forge_connected on attach', () => {
    expect(getEventCount(ctx, 'neural_forge_connected')).toBe(1);
    const s = (node as any).__neuralState;
    expect(s.weights.openness).toBe(0.5);
  });

  it('npc_ai_response logs experience', () => {
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'Hello' });
    const s = (node as any).__neuralState;
    expect(s.experienceLog).toContain('Hello');
  });

  it('auto synthesis triggers at threshold', () => {
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'One' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'Two' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'Three' });
    expect(getEventCount(ctx, 'neural_synthesis_request')).toBe(1);
    expect(getEventCount(ctx, 'neural_shard_created')).toBe(1);
    const s = (node as any).__neuralState;
    expect(s.shards.length).toBe(1);
    expect(s.experienceLog.length).toBe(0); // Cleared after synth
  });

  it('absorb personality shard modifies weights', () => {
    sendEvent(neuralForgeHandler, node, cfg, ctx, {
      type: 'neural_absorb_shard',
      shard: {
        id: 'shard-1',
        sourceId: 'other',
        timestamp: Date.now(),
        type: 'personality',
        data: { modifiers: { openness: 0.2 } },
        weight: 1.0,
      },
    });
    const s = (node as any).__neuralState;
    expect(s.weights.openness).toBeCloseTo(0.7);
    expect(getEventCount(ctx, 'neural_cognition_evolved')).toBe(1);
  });

  it('weights clamped between 0 and 1', () => {
    sendEvent(neuralForgeHandler, node, cfg, ctx, {
      type: 'neural_absorb_shard',
      shard: {
        id: 'shard-2',
        sourceId: 'other',
        timestamp: Date.now(),
        type: 'personality',
        data: { modifiers: { openness: 2.0 } },
        weight: 1.0,
      },
    });
    const s = (node as any).__neuralState;
    expect(s.weights.openness).toBeLessThanOrEqual(1);
  });

  it('detach cleans up', () => {
    neuralForgeHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__neuralState).toBeUndefined();
  });
});
