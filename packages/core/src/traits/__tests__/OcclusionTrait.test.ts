import { describe, it, expect, beforeEach } from 'vitest';
import { occlusionHandler } from '../OcclusionTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('OcclusionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'environment' as const,
    depth_api: true,
    edge_smoothing: true,
    fade_distance: 0.5,
    hand_occlusion: true,
    occlusion_bias: 0.001,
    soft_edges: true,
    soft_edge_width: 0.02,
    priority: 0,
  };

  beforeEach(() => {
    node = createMockNode('occ');
    ctx = createMockContext();
    attachTrait(occlusionHandler, node, cfg, ctx);
  });

  it('initializes and emits occlusion_enable', () => {
    expect((node as any).__occlusionState.isOccluded).toBe(false);
    expect(getEventCount(ctx, 'occlusion_enable')).toBe(1);
  });

  it('occlusion_update triggers start event', () => {
    sendEvent(occlusionHandler, node, cfg, ctx, {
      type: 'occlusion_update',
      isOccluded: true,
      amount: 0.8,
    });
    expect((node as any).__occlusionState.isOccluded).toBe(true);
    expect((node as any).__occlusionState.occlusionAmount).toBe(0.8);
    expect(getEventCount(ctx, 'occlusion_start')).toBe(1);
  });

  it('occlusion end emits occlusion_end', () => {
    sendEvent(occlusionHandler, node, cfg, ctx, {
      type: 'occlusion_update',
      isOccluded: true,
      amount: 1,
    });
    sendEvent(occlusionHandler, node, cfg, ctx, {
      type: 'occlusion_update',
      isOccluded: false,
      amount: 0,
    });
    expect(getEventCount(ctx, 'occlusion_end')).toBe(1);
  });

  it('update fades progress toward target', () => {
    sendEvent(occlusionHandler, node, cfg, ctx, {
      type: 'occlusion_update',
      isOccluded: true,
      amount: 1,
    });
    updateTrait(occlusionHandler, node, cfg, ctx, 0.1);
    const s = (node as any).__occlusionState;
    expect(s.fadeProgress).toBeGreaterThan(0);
    expect(s.fadeProgress).toBeLessThanOrEqual(1);
  });

  it('depth_available updates state', () => {
    sendEvent(occlusionHandler, node, cfg, ctx, { type: 'depth_available', available: true });
    expect((node as any).__occlusionState.depthAvailable).toBe(true);
  });

  it('hand_occlusion_update activates when enabled', () => {
    sendEvent(occlusionHandler, node, cfg, ctx, {
      type: 'hand_occlusion_update',
      isOccludedByHand: true,
    });
    const s = (node as any).__occlusionState;
    expect(s.handOcclusionActive).toBe(true);
    expect(s.isOccluded).toBe(true);
    expect(s.occlusionAmount).toBeGreaterThanOrEqual(0.5);
  });

  it('edge smoothing emits set_opacity during fade', () => {
    sendEvent(occlusionHandler, node, cfg, ctx, {
      type: 'occlusion_update',
      isOccluded: true,
      amount: 1,
    });
    // Partially fade
    updateTrait(occlusionHandler, node, cfg, ctx, 0.1);
    expect(getEventCount(ctx, 'set_opacity')).toBeGreaterThanOrEqual(1);
  });

  it('cleans up on detach', () => {
    occlusionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__occlusionState).toBeUndefined();
    expect(getEventCount(ctx, 'occlusion_disable')).toBe(1);
  });
});
