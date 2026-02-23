/**
 * NeuralForgeTrait — Production Test Suite
 *
 * neuralForgeHandler stores state on node.__neuralState.
 *
 * Key behaviours:
 * 1. defaultConfig — 3 fields (auto_synthesize, synthesis_threshold, base_weights)
 * 2. onAttach — state init (shards=[], weights=copy of base_weights, experienceLog=[], lastSynthesis);
 *              emits neural_forge_connected
 * 3. onDetach — removes __neuralState
 * 4. onEvent — npc_ai_response:
 *   a. pushes text to experienceLog
 *   b. auto_synthesize=true && log.length >= threshold →
 *      emits neural_synthesis_request, creates shard, pushes shard, clears log,
 *      emits neural_shard_created + neural_cognition_evolved
 *   c. auto_synthesize=false → no shard created
 *   d. below threshold → no synthesis
 * 5. onEvent — neural_absorb_shard:
 *   a. pushes shard to state.shards regardless of type
 *   b. type='personality' → applies clamped modifiers to weights
 *   c. type='memory' → no weight change
 *   d. emits neural_cognition_evolved
 */
import { describe, it, expect, vi } from 'vitest';
import { neuralForgeHandler } from '../NeuralForgeTrait';
import type { NeuralShard } from '../NeuralForgeTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(id = 'npc_node') {
  return { id, properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof neuralForgeHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...neuralForgeHandler.defaultConfig!, ...cfg };
  neuralForgeHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function makeShard(type: NeuralShard['type'] = 'memory', data: any = {}): NeuralShard {
  return { id: 'shard-1', sourceId: 'src', timestamp: Date.now(), type, data, weight: 0.5 };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('neuralForgeHandler.defaultConfig', () => {
  const d = neuralForgeHandler.defaultConfig!;
  it('auto_synthesize=true', () => expect(d.auto_synthesize).toBe(true));
  it('synthesis_threshold=10', () => expect(d.synthesis_threshold).toBe(10));
  it('base_weights has 5 Big-Five traits at 0.5', () => {
    expect(d.base_weights.openness).toBe(0.5);
    expect(d.base_weights.conscientiousness).toBe(0.5);
    expect(d.base_weights.extroversion).toBe(0.5);
    expect(d.base_weights.agreeableness).toBe(0.5);
    expect(d.base_weights.neuroticism).toBe(0.5);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('neuralForgeHandler.onAttach', () => {
  it('initialises __neuralState', () => {
    const { node } = attach();
    expect((node as any).__neuralState).toBeDefined();
  });

  it('shards=[] initially', () => {
    const { node } = attach();
    expect((node as any).__neuralState.shards).toEqual([]);
  });

  it('experienceLog=[] initially', () => {
    const { node } = attach();
    expect((node as any).__neuralState.experienceLog).toEqual([]);
  });

  it('weights are a copy of base_weights', () => {
    const { node, config } = attach({ base_weights: { openness: 0.8, conscientiousness: 0.3, extroversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 } });
    expect((node as any).__neuralState.weights).toEqual({ openness: 0.8, conscientiousness: 0.3, extroversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 });
    // Ensure it's a copy (mutation safe)
    (node as any).__neuralState.weights.openness = 0.0;
    expect(config.base_weights.openness).toBe(0.8);
  });

  it('emits neural_forge_connected', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('neural_forge_connected', expect.objectContaining({ node: expect.any(Object) }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('neuralForgeHandler.onDetach', () => {
  it('removes __neuralState', () => {
    const { node, ctx, config } = attach();
    neuralForgeHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__neuralState).toBeUndefined();
  });
});

// ─── onEvent — npc_ai_response (no synthesis) ─────────────────────────────────

describe('neuralForgeHandler.onEvent — npc_ai_response below threshold', () => {
  it('pushes text to experienceLog', () => {
    const { node, ctx, config } = attach({ synthesis_threshold: 5 });
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'Hello' });
    expect((node as any).__neuralState.experienceLog).toEqual(['Hello']);
  });

  it('does not emit neural_synthesis_request when below threshold', () => {
    const { node, ctx, config } = attach({ synthesis_threshold: 5 });
    ctx.emit.mockClear();
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'Hi' });
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_synthesis_request', expect.anything());
  });

  it('no shard created when auto_synthesize=false even at threshold', () => {
    const { node, ctx, config } = attach({ auto_synthesize: false, synthesis_threshold: 1 });
    ctx.emit.mockClear();
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'Hi' });
    expect((node as any).__neuralState.shards).toHaveLength(0);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_shard_created', expect.anything());
  });
});

// ─── onEvent — npc_ai_response (auto-synthesis triggered) ────────────────────

describe('neuralForgeHandler.onEvent — npc_ai_response auto-synthesis', () => {
  function setupAtThreshold(threshold = 3) {
    const { node, ctx, config } = attach({ auto_synthesize: true, synthesis_threshold: threshold });
    // Fill log to threshold - 1
    const state = (node as any).__neuralState;
    for (let i = 0; i < threshold - 1; i++) state.experienceLog.push(`msg${i}`);
    ctx.emit.mockClear();
    return { node, ctx, config };
  }

  it('emits neural_synthesis_request at threshold', () => {
    const { node, ctx, config } = setupAtThreshold(3);
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'trigger' });
    expect(ctx.emit).toHaveBeenCalledWith('neural_synthesis_request', expect.any(Object));
  });

  it('creates a memory shard and pushes it', () => {
    const { node, ctx, config } = setupAtThreshold(3);
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'trigger' });
    const state = (node as any).__neuralState;
    expect(state.shards).toHaveLength(1);
    expect(state.shards[0].type).toBe('memory');
  });

  it('shard id starts with shard_', () => {
    const { node, ctx, config } = setupAtThreshold(2);
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'trigger' });
    const shard = (node as any).__neuralState.shards[0];
    expect(shard.id).toMatch(/^shard_\d+$/);
  });

  it('clears experienceLog after synthesis', () => {
    const { node, ctx, config } = setupAtThreshold(3);
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'trigger' });
    expect((node as any).__neuralState.experienceLog).toEqual([]);
  });

  it('emits neural_shard_created', () => {
    const { node, ctx, config } = setupAtThreshold(3);
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'trigger' });
    expect(ctx.emit).toHaveBeenCalledWith('neural_shard_created', expect.objectContaining({ shard: expect.any(Object) }));
  });

  it('emits neural_cognition_evolved with weights', () => {
    const { node, ctx, config } = setupAtThreshold(3);
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text: 'trigger' });
    expect(ctx.emit).toHaveBeenCalledWith('neural_cognition_evolved', expect.objectContaining({ currentWeights: expect.any(Object) }));
  });
});

// ─── onEvent — neural_absorb_shard ────────────────────────────────────────────

describe('neuralForgeHandler.onEvent — neural_absorb_shard', () => {
  it('pushes shard to state.shards', () => {
    const { node, ctx, config } = attach();
    const shard = makeShard('memory');
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard });
    expect((node as any).__neuralState.shards).toContain(shard);
  });

  it('memory shard does NOT change weights', () => {
    const { node, ctx, config } = attach();
    const before = { ...(node as any).__neuralState.weights };
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard: makeShard('memory') });
    expect((node as any).__neuralState.weights).toEqual(before);
  });

  it('personality shard modulates weights', () => {
    const { node, ctx, config } = attach();
    const shard = makeShard('personality', { modifiers: { openness: 0.2, neuroticism: -0.3 } });
    // weight = 0.5 + 0.2*0.5 = 0.6 for openness; 0.5 + (-0.3)*0.5 = 0.35 for neuroticism
    shard.weight = 0.5;
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard });
    const weights = (node as any).__neuralState.weights;
    expect(weights.openness).toBeCloseTo(0.6, 5);
    expect(weights.neuroticism).toBeCloseTo(0.35, 5);
  });

  it('personality shard clamps result to 0', () => {
    const { node, ctx, config } = attach({ base_weights: { openness: 0.1, conscientiousness: 0.5, extroversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 } });
    const shard = makeShard('personality', { modifiers: { openness: -5 } });
    shard.weight = 1.0;
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard });
    expect((node as any).__neuralState.weights.openness).toBe(0);
  });

  it('personality shard clamps result to 1', () => {
    const { node, ctx, config } = attach({ base_weights: { openness: 0.9, conscientiousness: 0.5, extroversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 } });
    const shard = makeShard('personality', { modifiers: { openness: 5 } });
    shard.weight = 1.0;
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard });
    expect((node as any).__neuralState.weights.openness).toBe(1);
  });

  it('personality shard ignores unknown weight keys', () => {
    const { node, ctx, config } = attach();
    const shard = makeShard('personality', { modifiers: { unknown_trait: 99.9 } });
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard });
    // No crash, existing weights unchanged
    const weights = (node as any).__neuralState.weights;
    expect(weights.openness).toBe(0.5);
  });

  it('emits neural_cognition_evolved', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    neuralForgeHandler.onEvent!(node as any, config, ctx as any, { type: 'neural_absorb_shard', shard: makeShard() });
    expect(ctx.emit).toHaveBeenCalledWith('neural_cognition_evolved', expect.objectContaining({ currentWeights: expect.any(Object) }));
  });
});
