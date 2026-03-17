/**
 * BuoyancyTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { buoyancyHandler } from '../BuoyancyTrait';

function makeNode(y = 0, scaleY = 1) {
  return { id: 'buoy', position: { x: 0, y, z: 0 }, scale: { x: 1, y: scaleY, z: 1 } };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}, y = 0, scaleY = 1) {
  const node = makeNode(y, scaleY);
  const ctx = makeContext();
  const cfg = { ...buoyancyHandler.defaultConfig!, ...config };
  buoyancyHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('buoyancyHandler.defaultConfig', () => {
  it('fluid_density = 1000', () => expect(buoyancyHandler.defaultConfig!.fluid_density).toBe(1000));
  it('fluid_level = 0', () => expect(buoyancyHandler.defaultConfig!.fluid_level).toBe(0));
  it('drag = 1.0', () => expect(buoyancyHandler.defaultConfig!.drag).toBe(1.0));
  it('angular_drag = 0.5', () => expect(buoyancyHandler.defaultConfig!.angular_drag).toBe(0.5));
  it('flow_direction = [0,0,0]', () =>
    expect(buoyancyHandler.defaultConfig!.flow_direction).toEqual([0, 0, 0]));
  it('flow_strength = 0', () => expect(buoyancyHandler.defaultConfig!.flow_strength).toBe(0));
  it('splash_effect = true', () => expect(buoyancyHandler.defaultConfig!.splash_effect).toBe(true));
  it('submerge_threshold = 0.9', () =>
    expect(buoyancyHandler.defaultConfig!.submerge_threshold).toBe(0.9));
  it('object_density = 500', () => expect(buoyancyHandler.defaultConfig!.object_density).toBe(500));
  it('object_volume = 1.0', () => expect(buoyancyHandler.defaultConfig!.object_volume).toBe(1.0));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('buoyancyHandler.onAttach', () => {
  it('creates __buoyancyState', () => expect(attachNode().node.__buoyancyState).toBeDefined());
  it('isSubmerged = false', () =>
    expect(attachNode().node.__buoyancyState.isSubmerged).toBe(false));
  it('submersionRatio = 0', () =>
    expect(attachNode().node.__buoyancyState.submersionRatio).toBe(0));
  it('buoyancyForce = 0', () => expect(attachNode().node.__buoyancyState.buoyancyForce).toBe(0));
  it('velocity = {0,0,0}', () =>
    expect(attachNode().node.__buoyancyState.velocity).toEqual({ x: 0, y: 0, z: 0 }));
  it('splashCooldown = 0', () => expect(attachNode().node.__buoyancyState.splashCooldown).toBe(0));
  it('lastPosition copies node.position', () => {
    const node = makeNode(3);
    const ctx = makeContext();
    buoyancyHandler.onAttach!(node, { ...buoyancyHandler.defaultConfig! }, ctx);
    expect((node as any).__buoyancyState.lastPosition).toEqual({ x: 0, y: 3, z: 0 });
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('buoyancyHandler.onDetach', () => {
  it('removes __buoyancyState', () => {
    const { node, cfg, ctx } = attachNode();
    buoyancyHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__buoyancyState).toBeUndefined();
  });
});

// ─── onUpdate — velocity calculation ─────────────────────────────────────────

describe('buoyancyHandler.onUpdate — velocity', () => {
  it('computes velocity from position change / delta', () => {
    const { node, cfg, ctx } = attachNode({}, 0);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: 0, z: 0 };
    node.position = { x: 0, y: 2, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.5);
    // velocity.y = (2 - 0) / 0.5 = 4
    expect((node as any).__buoyancyState.velocity.y).toBeCloseTo(4, 5);
  });
  it('updates lastPosition to current position', () => {
    const { node, cfg, ctx } = attachNode({}, 5);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: 0, z: 0 };
    node.position = { x: 0, y: 5, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.lastPosition).toEqual({ x: 0, y: 5, z: 0 });
  });
});

// ─── onUpdate — submersion & buoyancy force ───────────────────────────────────

describe('buoyancyHandler.onUpdate — submersion & Archimedes force', () => {
  it('fully submerged (objectTop <= fluidLevel): submersionRatio = 1.0', () => {
    // node at y=-5, scaleY=2 → top=-4, fluid_level=0 → fully submerged
    const { node, cfg, ctx } = attachNode({ fluid_level: 0 }, -5, 2);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.submersionRatio).toBe(1.0);
  });
  it('above water (objectBottom >= fluidLevel): submersionRatio = 0', () => {
    // node at y=10, scaleY=1 → bottom=9.5, fluid_level=0 → above water
    const { node, cfg, ctx } = attachNode({ fluid_level: 0 }, 10, 1);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: 10, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.submersionRatio).toBe(0);
  });
  it('half submerged: submersionRatio ≈ 0.5', () => {
    // node at y=0.5, scaleY=1 → bottom=0, top=1, fluid_level=0.5
    const { node, cfg, ctx } = attachNode({ fluid_level: 0.5 }, 0.5, 1);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: 0.5, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__buoyancyState.submersionRatio).toBeCloseTo(0.5, 5);
  });
  it('emits apply_force when submerged (buoyancy)', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0 }, -5, 2);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    const calls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'apply_force');
    expect(calls.length).toBeGreaterThan(0);
    // First call: buoyancy/net force upward
    const netForce = calls[0][1].force;
    // objectWeight = 500 * 1 * 9.81 = 4905, buoyancy = 1000 * 1 * 1 * 9.81 = 9810, net = 4905
    expect(netForce.y).toBeCloseTo(4905, 0);
  });
  it('does NOT emit apply_force when above water (submersionRatio=0)', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: -10 }, 5, 1);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: 5, z: 0 };
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('apply_force', expect.any(Object));
  });
  it('emits drag force opposing velocity when submerged', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0, drag: 2 }, -5, 2);
    (node as any).__buoyancyState.lastPosition = { x: 2, y: -5, z: 0 };
    node.position = { x: 2, y: -5, z: 0 };
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    const dragCalls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'apply_force');
    // Second apply_force = drag (first is buoyancy net)
    expect(dragCalls.length).toBeGreaterThanOrEqual(2);
  });
  it('emits flow force when flow_strength > 0 and submerged', () => {
    const { node, cfg, ctx } = attachNode(
      {
        fluid_level: 0,
        flow_strength: 3,
        flow_direction: [1, 0, 0],
      },
      -5,
      2
    );
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    const forceCalls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'apply_force');
    // 3 forces: buoyancy, drag, flow
    expect(forceCalls.length).toBeGreaterThanOrEqual(3);
    const flowForce = forceCalls[2][1].force;
    expect(flowForce.x).toBeGreaterThan(0);
  });
  it('does NOT emit flow force when flow_strength = 0', () => {
    const { node, cfg, ctx } = attachNode(
      {
        fluid_level: 0,
        flow_strength: 0,
        flow_direction: [1, 0, 0],
      },
      -5,
      2
    );
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    const forceCalls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'apply_force');
    expect(forceCalls.length).toBe(2); // Just buoyancy + drag
  });
});

// ─── onUpdate — splash events ─────────────────────────────────────────────────

describe('buoyancyHandler.onUpdate — splash & submerge events', () => {
  it('emits on_splash entering when prevSubmersion=0 → submerged', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0, splash_effect: true }, -5, 2);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    (node as any).__buoyancyState.submersionRatio = 0; // was out of water
    (node as any).__buoyancyState.velocity = { x: 0, y: -3, z: 0 };
    ctx.emit.mockClear();
    // Simulate by running onUpdate; state.submersionRatio will become 1.0 (fully submerged)
    // prevSubmersion needs to be 0 so we patch it before call
    const state = (node as any).__buoyancyState;
    state.submersionRatio = 0;
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('on_splash', expect.objectContaining({ entering: true }));
  });
  it('does NOT emit on_splash entering when splash_effect=false', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0, splash_effect: false }, -5, 2);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    (node as any).__buoyancyState.submersionRatio = 0;
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('on_splash', expect.any(Object));
  });
  it('on_splash intensity clamped to 1 for high velocity', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0, splash_effect: true }, -5, 2);
    (node as any).__buoyancyState.submersionRatio = 0;
    (node as any).__buoyancyState.velocity = { x: 0, y: -100, z: 0 }; // very fast
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    const splashCall = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_splash');
    if (splashCall) {
      expect(splashCall[1].intensity).toBeLessThanOrEqual(1);
    }
  });
  it('emits on_submerge when submersion crosses submerge_threshold', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0, submerge_threshold: 0.9 }, -5, 2);
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    (node as any).__buoyancyState.isSubmerged = false;
    ctx.emit.mockClear();
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('on_submerge', expect.objectContaining({ node }));
  });
  it('splashCooldown decrements by delta', () => {
    const { node, cfg, ctx } = attachNode({}, -5, 2);
    (node as any).__buoyancyState.splashCooldown = 0.5;
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.1);
    expect((node as any).__buoyancyState.splashCooldown).toBeCloseTo(0.4, 5);
  });
  it('splashCooldown does not go below 0', () => {
    const { node, cfg, ctx } = attachNode({}, -5, 2);
    (node as any).__buoyancyState.splashCooldown = 0.05;
    (node as any).__buoyancyState.lastPosition = { x: 0, y: -5, z: 0 };
    buoyancyHandler.onUpdate!(node, cfg, ctx, 0.3);
    expect((node as any).__buoyancyState.splashCooldown).toBeGreaterThanOrEqual(0);
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('buoyancyHandler.onEvent — set_fluid_level', () => {
  it('updates config.fluid_level', () => {
    const { node, cfg, ctx } = attachNode({ fluid_level: 0 });
    buoyancyHandler.onEvent!(node, cfg, ctx, { type: 'set_fluid_level', level: 5 });
    expect(cfg.fluid_level).toBe(5);
  });
  it('unknown event does not throw', () => {
    const { node, cfg, ctx } = attachNode();
    expect(() => buoyancyHandler.onEvent!(node, cfg, ctx, { type: 'unknown_event' })).not.toThrow();
  });
});
