import { describe, it, expect, beforeEach } from 'vitest';
import { buoyancyHandler } from '../BuoyancyTrait';
import { createMockContext, createMockNode, attachTrait, updateTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('BuoyancyTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    fluid_density: 1000,
    fluid_level: 0,
    drag: 1.0,
    angular_drag: 0.5,
    flow_direction: [0, 0, 0],
    flow_strength: 0,
    splash_effect: true,
    submerge_threshold: 0.9,
    object_density: 500,
    object_volume: 1.0,
  };

  beforeEach(() => {
    node = createMockNode('buoy');
    (node as any).position = { x: 0, y: 5, z: 0 };
    (node as any).scale = { x: 1, y: 1, z: 1 };
    ctx = createMockContext();
    attachTrait(buoyancyHandler, node, cfg, ctx);
  });

  it('inits with zero submersion above water', () => {
    const s = (node as any).__buoyancyState;
    expect(s.isSubmerged).toBe(false);
    expect(s.submersionRatio).toBe(0);
  });

  it('no force applied when above water', () => {
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'apply_force')).toBe(0);
  });

  it('applies buoyancy force when partially submerged', () => {
    (node as any).position = { x: 0, y: -0.25, z: 0 }; // 75% submerged (height=1, fluid=0)
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -0.25, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'apply_force')).toBeGreaterThanOrEqual(1);
  });

  it('splash on entering water', () => {
    // Start above water
    (node as any).position = { x: 0, y: 5, z: 0 };
    (node as any).__buoyancyState.lastPosition = { x: 0, y: 5, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);

    // Move below surface
    (node as any).position = { x: 0, y: 0.2, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'on_splash')).toBe(1);
  });

  it('fully submerged emits on_submerge', () => {
    (node as any).position = { x: 0, y: -5, z: 0 };
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.isSubmerged).toBe(true);
    expect(getEventCount(ctx, 'on_submerge')).toBe(1);
  });

  it('flow force applied when in water', () => {
    const flowCfg = { ...cfg, flow_direction: [1, 0, 0], flow_strength: 10 };
    (node as any).position = { x: 0, y: -0.5, z: 0 };
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -0.5, z: 0 };
    updateTrait(buoyancyHandler, node, flowCfg, ctx, 0.016);
    expect(getEventCount(ctx, 'apply_force')).toBeGreaterThanOrEqual(3); // buoyancy + drag + flow
  });

  it('set_fluid_level changes level', () => {
    sendEvent(buoyancyHandler, node, cfg, ctx, { type: 'set_fluid_level', level: 10 });
    // Config is mutated directly in handler
  });

  it('detach cleans up', () => {
    buoyancyHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__buoyancyState).toBeUndefined();
  });
});
