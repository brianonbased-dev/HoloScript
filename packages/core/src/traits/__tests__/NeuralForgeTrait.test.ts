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

  it('auto synthesis (mock mode) creates shard locally without emitting fake request', () => {
    // /critic Annoying #10 fix: mock mode no longer emits a 'neural_synthesis_request'
    // it never actually sends to anyone. It just creates the shard locally and emits
    // 'neural_shard_created'. Callers that want real synthesis use synthesis_mode='external'.
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'One' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'Two' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'Three' });
    expect(getEventCount(ctx, 'neural_synthesis_request')).toBe(0); // mock mode is silent
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

describe('NeuralForgeTrait — external synthesis mode (v1.1.0)', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    auto_synthesize: true,
    synthesis_threshold: 3,
    base_weights: { openness: 0.5, extroversion: 0.5 },
    synthesis_mode: 'external' as const,
  };

  beforeEach(() => {
    node = createMockNode('nfx');
    ctx = createMockContext();
    attachTrait(neuralForgeHandler, node, cfg, ctx);
  });

  it('threshold trigger in external mode emits request with experiences + weights, does NOT auto-create shard', () => {
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'a' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'b' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'c' });
    expect(getEventCount(ctx, 'neural_synthesis_request')).toBe(1);
    // External mode does NOT create the immediate mock shard
    expect(getEventCount(ctx, 'neural_shard_created')).toBe(0);
    const s = (node as any).__neuralState;
    expect(s.shards.length).toBe(0);
    // Log NOT cleared yet — waits for the response
    expect(s.experienceLog.length).toBe(3);
    expect(s.pendingExternalSynthesis).toBe(true);
  });

  it('external request payload includes experiences + currentWeights', () => {
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'A' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'B' });
    sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: 'C' });
    const lastReq = ctx.emittedEvents.filter((e) => e.event === 'neural_synthesis_request').pop();
    const payload = lastReq?.data as { mode: string; experiences: string[]; currentWeights: Record<string, number> };
    expect(payload.mode).toBe('external');
    expect(payload.experiences).toEqual(['A', 'B', 'C']);
    expect(payload.currentWeights.openness).toBe(0.5);
  });

  it('external mode does not storm — second threshold-cross while pending is ignored', () => {
    // Trigger first synthesis (3 events at threshold=3)
    for (const t of ['1', '2', '3']) {
      sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: t });
    }
    expect(getEventCount(ctx, 'neural_synthesis_request')).toBe(1);
    // Add more events while pending — should NOT re-emit request
    for (const t of ['4', '5', '6']) {
      sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: t });
    }
    expect(getEventCount(ctx, 'neural_synthesis_request')).toBe(1); // still 1, not stormed
    const s = (node as any).__neuralState;
    expect(s.experienceLog.length).toBe(6); // log keeps accumulating until response
  });

  it('neural_absorb_shard while pending clears log + timestamp + unblocks pending', () => {
    // Trigger external synthesis
    for (const t of ['x', 'y', 'z']) {
      sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: t });
    }
    const beforeStamp = (node as any).__neuralState.lastSynthesis;
    // External synthesizer responds with a real shard
    sendEvent(neuralForgeHandler, node, cfg, ctx, {
      type: 'neural_absorb_shard',
      shard: {
        id: 'real-shard-1',
        sourceId: 'llm-synthesizer',
        timestamp: Date.now() + 100,
        type: 'memory',
        data: { summary: 'Real LLM-generated summary of experiences x, y, z' },
        weight: 0.3,
      },
    });
    const s = (node as any).__neuralState;
    expect(s.shards.length).toBe(1);
    expect(s.shards[0].id).toBe('real-shard-1');
    expect(s.experienceLog.length).toBe(0); // cleared
    expect(s.lastSynthesis).toBeGreaterThanOrEqual(beforeStamp); // bumped
    expect(s.pendingExternalSynthesis).toBe(false); // unblocked
  });

  it('after external response, next threshold trigger emits a fresh request', () => {
    for (const t of ['1', '2', '3']) {
      sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: t });
    }
    sendEvent(neuralForgeHandler, node, cfg, ctx, {
      type: 'neural_absorb_shard',
      shard: {
        id: 's1',
        sourceId: 'ext',
        timestamp: 0,
        type: 'memory',
        data: {},
        weight: 0.1,
      },
    });
    // Now another round of 3 events
    for (const t of ['4', '5', '6']) {
      sendEvent(neuralForgeHandler, node, cfg, ctx, { type: 'npc_ai_response', text: t });
    }
    expect(getEventCount(ctx, 'neural_synthesis_request')).toBe(2); // two rounds
  });

  it('mock-mode does NOT emit neural_synthesis_request (the dual-emit trap is closed)', () => {
    // /critic Annoying #10 fix: previously mock mode emitted a fake
    // neural_synthesis_request alongside its self-fulfilling shard creation.
    // Any future listener wiring would have seen a duplicate shard. Now mock
    // mode is silent on the request channel — only neural_shard_created fires.
    const mockNode = createMockNode('nfm');
    const mockCtx = createMockContext();
    const mockCfg = { ...cfg, synthesis_mode: 'mock' as const };
    attachTrait(neuralForgeHandler, mockNode, mockCfg, mockCtx);
    for (const t of ['1', '2', '3']) {
      sendEvent(neuralForgeHandler, mockNode, mockCfg, mockCtx, {
        type: 'npc_ai_response',
        text: t,
      });
    }
    expect(getEventCount(mockCtx, 'neural_synthesis_request')).toBe(0); // closed
    expect(getEventCount(mockCtx, 'neural_shard_created')).toBe(1); // mock self-creates
    const s = (mockNode as any).__neuralState;
    expect(s.experienceLog.length).toBe(0); // cleared by mock path
  });
});
