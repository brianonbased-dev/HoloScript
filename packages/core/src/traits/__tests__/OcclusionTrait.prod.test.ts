/**
 * OcclusionTrait — Production Test Suite
 *
 * Tests defaultConfig, onAttach state init, onUpdate fade logic,
 * and onEvent occlusion_update / depth_available / hand_occlusion_update.
 */
import { describe, it, expect, vi } from 'vitest';
import { occlusionHandler } from '../OcclusionTrait';

function makeNode() {
  return { id: 'node_1', material: { color: '#FFFFFF', emissive: '#000000', opacity: 1 } };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...occlusionHandler.defaultConfig!, ...config };
  occlusionHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('occlusionHandler.defaultConfig', () => {
  it('mode = environment', () => expect(occlusionHandler.defaultConfig!.mode).toBe('environment'));
  it('depth_api = true', () => expect(occlusionHandler.defaultConfig!.depth_api).toBe(true));
  it('edge_smoothing = true', () => expect(occlusionHandler.defaultConfig!.edge_smoothing).toBe(true));
  it('fade_distance = 0.5', () => expect(occlusionHandler.defaultConfig!.fade_distance).toBe(0.5));
  it('hand_occlusion = true', () => expect(occlusionHandler.defaultConfig!.hand_occlusion).toBe(true));
  it('occlusion_bias = 0.001', () => expect(occlusionHandler.defaultConfig!.occlusion_bias).toBe(0.001));
  it('soft_edges = true', () => expect(occlusionHandler.defaultConfig!.soft_edges).toBe(true));
  it('soft_edge_width = 0.02', () => expect(occlusionHandler.defaultConfig!.soft_edge_width).toBe(0.02));
  it('priority = 0', () => expect(occlusionHandler.defaultConfig!.priority).toBe(0));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('occlusionHandler.onAttach', () => {
  it('sets __occlusionState on node', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState).toBeDefined();
  });
  it('initial isOccluded = false', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState.isOccluded).toBe(false);
  });
  it('initial occlusionAmount = 0', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState.occlusionAmount).toBe(0);
  });
  it('initial depthAvailable = false', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState.depthAvailable).toBe(false);
  });
  it('initial handOcclusionActive = false', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState.handOcclusionActive).toBe(false);
  });
  it('initial occludingObjects = []', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState.occludingObjects).toEqual([]);
  });
  it('initial fadeProgress = 0', () => {
    const { node } = attachNode();
    expect((node as any).__occlusionState.fadeProgress).toBe(0);
  });
  it('emits occlusion_enable to configure renderer', () => {
    const { ctx } = attachNode();
    expect(ctx.emit).toHaveBeenCalledWith('occlusion_enable', expect.any(Object));
  });
  it('occlusion_enable includes mode and priority', () => {
    const { ctx } = attachNode({ mode: 'depth', priority: 2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'occlusion_enable');
    expect(call?.[1].mode).toBe('depth');
    expect(call?.[1].priority).toBe(2);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('occlusionHandler.onDetach', () => {
  it('removes __occlusionState from node', () => {
    const { node, cfg, ctx } = attachNode();
    occlusionHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__occlusionState).toBeUndefined();
  });
  it('emits occlusion_disable', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    occlusionHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('occlusion_disable', expect.any(Object));
  });
});

// ─── onUpdate (fade logic) ────────────────────────────────────────────────────

describe('occlusionHandler.onUpdate', () => {
  it('does not throw when no state', () => {
    const node = makeNode(); // no __occlusionState
    const ctx = makeContext();
    expect(() => occlusionHandler.onUpdate!(node, occlusionHandler.defaultConfig!, ctx, 0.016)).not.toThrow();
  });
  it('fadeProgress increases toward 1 when isOccluded=true', () => {
    const { node, cfg, ctx } = attachNode({ fade_distance: 1.0 });
    (node as any).__occlusionState.isOccluded = true;
    (node as any).__occlusionState.occlusionAmount = 1;
    occlusionHandler.onUpdate!(node, cfg, ctx, 0.5); // deltaTime=0.5, fadeSpeed=0.5/1.0=0.5
    expect((node as any).__occlusionState.fadeProgress).toBeGreaterThan(0);
  });
  it('fadeProgress decreases toward 0 when isOccluded=false', () => {
    const { node, cfg, ctx } = attachNode({ fade_distance: 1.0 });
    (node as any).__occlusionState.fadeProgress = 0.8;
    (node as any).__occlusionState.isOccluded = false;
    occlusionHandler.onUpdate!(node, cfg, ctx, 0.5);
    expect((node as any).__occlusionState.fadeProgress).toBeLessThan(0.8);
  });
  it('emits set_opacity when edge_smoothing and mid-fade', () => {
    const { node, cfg, ctx } = attachNode({ fade_distance: 1.0, edge_smoothing: true });
    (node as any).__occlusionState.isOccluded = true;
    (node as any).__occlusionState.occlusionAmount = 0.8;
    (node as any).__occlusionState.fadeProgress = 0.5; // mid-fade
    occlusionHandler.onUpdate!(node, cfg, ctx, 0.001); // tiny delta to keep in mid-fade
    expect(ctx.emit).toHaveBeenCalledWith('set_opacity', expect.objectContaining({ node }));
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('occlusionHandler.onEvent — occlusion_update', () => {
  it('sets isOccluded=true and emits occlusion_start on first occlusion', () => {
    const { node, cfg, ctx } = attachNode();
    occlusionHandler.onEvent!(node, cfg, ctx, {
      type: 'occlusion_update', isOccluded: true, amount: 0.9, occludingObjects: ['wall'],
    });
    expect((node as any).__occlusionState.isOccluded).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('occlusion_start', expect.any(Object));
  });
  it('emits occlusion_end when going from occluded to clear', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__occlusionState.isOccluded = true; // was occluded
    occlusionHandler.onEvent!(node, cfg, ctx, {
      type: 'occlusion_update', isOccluded: false, amount: 0,
    });
    expect(ctx.emit).toHaveBeenCalledWith('occlusion_end', expect.any(Object));
  });
  it('stores occludingObjects list', () => {
    const { node, cfg, ctx } = attachNode();
    occlusionHandler.onEvent!(node, cfg, ctx, {
      type: 'occlusion_update', isOccluded: true, amount: 1, occludingObjects: ['wall', 'floor'],
    });
    expect((node as any).__occlusionState.occludingObjects).toEqual(['wall', 'floor']);
  });
  it('depth_available sets depthAvailable flag', () => {
    const { node, cfg, ctx } = attachNode();
    occlusionHandler.onEvent!(node, cfg, ctx, { type: 'depth_available', available: true });
    expect((node as any).__occlusionState.depthAvailable).toBe(true);
  });
  it('hand_occlusion_update sets handOcclusionActive and forces occluded', () => {
    const { node, cfg, ctx } = attachNode({ hand_occlusion: true });
    occlusionHandler.onEvent!(node, cfg, ctx, { type: 'hand_occlusion_update', isOccludedByHand: true });
    const s = (node as any).__occlusionState;
    expect(s.handOcclusionActive).toBe(true);
    expect(s.isOccluded).toBe(true);
    expect(s.occlusionAmount).toBeGreaterThanOrEqual(0.5);
  });
  it('hand_occlusion_update ignored when hand_occlusion=false in config', () => {
    const { node, cfg, ctx } = attachNode({ hand_occlusion: false });
    occlusionHandler.onEvent!(node, cfg, ctx, { type: 'hand_occlusion_update', isOccludedByHand: true });
    expect((node as any).__occlusionState.handOcclusionActive).toBe(false); // unchanged
  });
});
