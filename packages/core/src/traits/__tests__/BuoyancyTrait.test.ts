import { describe, it, expect, beforeEach } from 'vitest';
import { buoyancyHandler } from '../BuoyancyTrait';
import { createMockContext, createMockNode, attachTrait, updateTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

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
    node = createMockNode('boat');
    (node as any).position = { x: 0, y: 5, z: 0 }; // above water
    (node as any).scale = { x: 1, y: 1, z: 1 };
    ctx = createMockContext();
    attachTrait(buoyancyHandler, node, cfg, ctx);
  });

  it('initializes state', () => {
    const s = (node as any).__buoyancyState;
    expect(s).toBeDefined();
    expect(s.isSubmerged).toBe(false);
    expect(s.submersionRatio).toBe(0);
  });

  it('object above water has zero submersion', () => {
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.submersionRatio).toBe(0);
  });

  it('object below water is submerged', () => {
    (node as any).position = { x: 0, y: -2, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.submersionRatio).toBe(1);
    expect((node as any).__buoyancyState.isSubmerged).toBe(true);
  });

  it('partially submerged object has ratio between 0 and 1', () => {
    (node as any).position = { x: 0, y: 0, z: 0 }; // at water level
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    const ratio = (node as any).__buoyancyState.submersionRatio;
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('emits apply_force for submerged objects', () => {
    (node as any).position = { x: 0, y: -1, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'apply_force')).toBeGreaterThan(0);
  });

  it('emits on_splash when entering water', () => {
    // First update above water
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    ctx.clearEvents();
    // Move into water
    (node as any).position = { x: 0, y: -0.3, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'on_splash')).toBe(1);
    expect((getLastEvent(ctx, 'on_splash') as any).entering).toBe(true);
  });

  it('emits on_submerge when fully submerged', () => {
    // Partially in water first
    (node as any).position = { x: 0, y: 0, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    ctx.clearEvents();
    // Fully underwater
    (node as any).position = { x: 0, y: -5, z: 0 };
    updateTrait(buoyancyHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'on_submerge')).toBe(1);
  });

  it('applies flow force when flow_strength > 0', () => {
    const flowCfg = { ...cfg, flow_direction: [1, 0, 0], flow_strength: 10 };
    (node as any).position = { x: 0, y: -1, z: 0 };
    ctx.clearEvents();
    updateTrait(buoyancyHandler, node, flowCfg, ctx, 0.016);
    // Should have buoyancy + drag + flow forces
    expect(getEventCount(ctx, 'apply_force')).toBeGreaterThanOrEqual(3);
  });

  it('set_fluid_level event updates config', () => {
    const mutableCfg = { ...cfg };
    buoyancyHandler.onEvent?.(node as any, mutableCfg as any, ctx as any, { type: 'set_fluid_level', level: 10 } as any);
    expect(mutableCfg.fluid_level).toBe(10);
  });

  it('cleans up on detach', () => {
    buoyancyHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__buoyancyState).toBeUndefined();
  });
});
