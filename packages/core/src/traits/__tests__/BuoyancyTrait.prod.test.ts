/**
 * BuoyancyTrait — Production Tests (TraitHandler pattern)
 *
 * Tests exported pure physics helpers directly, and verifies the
 * buoyancyHandler TraitHandler by invoking onAttach/onDetach/onUpdate/onEvent
 * against a mock node.
 *
 * NOTE: calculateSubmersionRatio and calculateBuoyancyForce are private helpers
 * (not exported). We test their effects through onUpdate state observation.
 * We also test the publicly exposed handler interface thoroughly.
 */
import { describe, it, expect, vi } from 'vitest';
import { buoyancyHandler } from '../BuoyancyTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

type BuoyancyConfig = NonNullable<Parameters<typeof buoyancyHandler.onAttach>[1]>;

function mkConfig(overrides: Partial<BuoyancyConfig> = {}): BuoyancyConfig {
  return { ...buoyancyHandler.defaultConfig!, ...overrides };
}

function mkNode(position = { x: 0, y: 0, z: 0 }, scale = { x: 1, y: 1, z: 1 }) {
  return { position, scale };
}

function mkCtx() {
  const ctx = {
    emitted: [] as Array<{ type: string; payload: any }>,
    emit: vi.fn(),
  };
  ctx.emit = vi.fn((type: string, payload: any) => {
    ctx.emitted.push({ type, payload });
  }) as any;
  return ctx;
}

function attachNode(config: BuoyancyConfig, node: any, ctx: ReturnType<typeof mkCtx>) {
  buoyancyHandler.onAttach!(node as any, config, ctx as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────────

describe('buoyancyHandler — defaultConfig', () => {
  it('fluid_density = 1000', () => {
    expect(buoyancyHandler.defaultConfig?.fluid_density).toBe(1000);
  });

  it('fluid_level = 0', () => {
    expect(buoyancyHandler.defaultConfig?.fluid_level).toBe(0);
  });

  it('object_density = 500 (wood-like, floats)', () => {
    expect(buoyancyHandler.defaultConfig?.object_density).toBe(500);
  });

  it('object_volume = 1.0', () => {
    expect(buoyancyHandler.defaultConfig?.object_volume).toBe(1.0);
  });

  it('splash_effect = true', () => {
    expect(buoyancyHandler.defaultConfig?.splash_effect).toBe(true);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────────

describe('buoyancyHandler — onAttach', () => {
  it('creates __buoyancyState on node', () => {
    const node = mkNode();
    const ctx = mkCtx();
    attachNode(mkConfig(), node, ctx);
    expect((node as any).__buoyancyState).toBeDefined();
  });

  it('initial state: isSubmerged=false, submersionRatio=0, buoyancyForce=0', () => {
    const node = mkNode();
    const ctx = mkCtx();
    attachNode(mkConfig(), node, ctx);
    const s = (node as any).__buoyancyState;
    expect(s.isSubmerged).toBe(false);
    expect(s.submersionRatio).toBe(0);
    expect(s.buoyancyForce).toBe(0);
  });

  it('initial velocity is zero', () => {
    const node = mkNode();
    const ctx = mkCtx();
    attachNode(mkConfig(), node, ctx);
    const s = (node as any).__buoyancyState;
    expect(s.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────────

describe('buoyancyHandler — onDetach', () => {
  it('removes __buoyancyState from node', () => {
    const node = mkNode();
    const ctx = mkCtx();
    const cfg = mkConfig();
    attachNode(cfg, node, ctx);
    buoyancyHandler.onDetach!(node as any, cfg, ctx as any);
    expect((node as any).__buoyancyState).toBeUndefined();
  });
});

// ─── onUpdate — submersion physics ───────────────────────────────────────────────

describe('buoyancyHandler — onUpdate submersion physics', () => {
  it('object above fluid level: no apply_force emitted', () => {
    // Object at y=5, scale.y=1 → top=5.5, bottom=4.5, fluid_level=0 → ratio=0
    const node = mkNode({ x: 0, y: 5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({ fluid_level: 0, splash_effect: false });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const forces = ctx.emitted.filter((e) => e.type === 'apply_force');
    expect(forces).toHaveLength(0);
  });

  it('object fully submerged: apply_force is emitted', () => {
    // Object at y=-5, scale.y=1 → top=-4.5 < fluid_level=0 → ratio=1
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({ fluid_level: 0, splash_effect: false });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const forces = ctx.emitted.filter((e) => e.type === 'apply_force');
    expect(forces.length).toBeGreaterThan(0);
  });

  it('submerged object: buoyancyForce = fluid_density * volume * 1 * 9.81', () => {
    // Fully submerged: ratio=1, fluid_density=1000, volume=1 → F = 9810
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({ fluid_level: 0, splash_effect: false, fluid_density: 1000, object_volume: 1 });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const state = (node as any).__buoyancyState;
    expect(state.buoyancyForce).toBeCloseTo(9810);
  });

  it('floating object (density < fluid): net upward force > 0 when submerged', () => {
    // buoyancyForce = 9810, objectWeight = 500*1*9.81 = 4905 → net = 4905 up
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({
      fluid_level: 0, splash_effect: false,
      fluid_density: 1000, object_density: 500, object_volume: 1,
    });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const upF = ctx.emitted.find((e) => e.type === 'apply_force' && e.payload.force.y > 0);
    expect(upF).toBeDefined();
    expect(upF?.payload.force.y).toBeGreaterThan(0);
  });

  it('sinking object (density > fluid): net downward force when submerged', () => {
    // buoyancyForce = 9810, objectWeight = 2000*1*9.81 = 19620 → net = -9810
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({
      fluid_level: 0, splash_effect: false,
      fluid_density: 1000, object_density: 2000, object_volume: 1,
    });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const downF = ctx.emitted.find((e) => e.type === 'apply_force' && e.payload.force.y < 0);
    // Net force is buoyancy – weight = 9810 – 19620 = –9810 → downward
    expect(downF).toBeDefined();
  });

  it('flow force is emitted when flow_strength > 0 and submerged', () => {
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({
      fluid_level: 0, splash_effect: false,
      flow_direction: [1, 0, 0], flow_strength: 5,
    });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const flowF = ctx.emitted.find(
      (e) => e.type === 'apply_force' && e.payload.force.x > 0
    );
    expect(flowF).toBeDefined();
  });

  it('flow force is NOT emitted when flow_strength = 0', () => {
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    const cfg = mkConfig({ fluid_level: 0, splash_effect: false, flow_direction: [1, 0, 0], flow_strength: 0 });
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    // Only the buoyancy + drag forces should be emitted (both y-axis); no x-axis flow force
    const xForces = ctx.emitted.filter((e) => e.type === 'apply_force' && e.payload.force.x > 0);
    expect(xForces).toHaveLength(0);
  });
});

// ─── onUpdate — splash events ─────────────────────────────────────────────────────

describe('buoyancyHandler — onUpdate splash events', () => {
  it('entering water emits on_splash with entering=true', () => {
    // First update: above water (y=5) → sets submersionRatio=0
    const cfg = mkConfig({ fluid_level: 0, splash_effect: true });
    const node = mkNode({ x: 0, y: 5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    attachNode(cfg, node, ctx);
    // Now move object into water
    (node as any).position = { x: 0, y: -5, z: 0 };
    (node as any).__buoyancyState.velocity = { x: 0, y: -4, z: 0 };
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const splash = ctx.emitted.find((e) => e.type === 'on_splash');
    expect(splash?.payload.entering).toBe(true);
  });

  it('on_splash not emitted during cooldown', () => {
    const cfg = mkConfig({ fluid_level: 0, splash_effect: true });
    const node = mkNode({ x: 0, y: 5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    attachNode(cfg, node, ctx);
    (node as any).__buoyancyState.splashCooldown = 0.5; // active cooldown
    (node as any).position = { x: 0, y: -5, z: 0 };
    (node as any).__buoyancyState.velocity = { x: 0, y: -4, z: 0 };
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const splash = ctx.emitted.find((e) => e.type === 'on_splash');
    expect(splash).toBeUndefined();
  });
});

// ─── onUpdate — submersion state changes ─────────────────────────────────────────

describe('buoyancyHandler — onUpdate submersion state changes', () => {
  it('emits on_submerge when newly fully submerged', () => {
    const cfg = mkConfig({ fluid_level: 0, splash_effect: false, submerge_threshold: 0.9 });
    // Start deep under water
    const node = mkNode({ x: 0, y: -5, z: 0 }, { x: 1, y: 1, z: 1 });
    const ctx = mkCtx();
    attachNode(cfg, node, ctx);
    ctx.emitted = [];
    buoyancyHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    // submissionRatio = 1 ≥ 0.9 → isSubmerged = true (was false) → emit on_submerge
    const submerge = ctx.emitted.find((e) => e.type === 'on_submerge');
    expect(submerge).toBeDefined();
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────────

describe('buoyancyHandler — onEvent', () => {
  it('set_fluid_level updates config.fluid_level', () => {
    const cfg = mkConfig({ fluid_level: 0 });
    const node = mkNode();
    const ctx = mkCtx();
    attachNode(cfg, node, ctx);
    buoyancyHandler.onEvent!(node as any, cfg, ctx as any, { type: 'set_fluid_level', level: 5 } as any);
    expect(cfg.fluid_level).toBe(5);
  });

  it('unknown events do not throw', () => {
    const cfg = mkConfig();
    const node = mkNode();
    const ctx = mkCtx();
    attachNode(cfg, node, ctx);
    expect(() =>
      buoyancyHandler.onEvent!(node as any, cfg, ctx as any, { type: 'unknown_event' } as any)
    ).not.toThrow();
  });

  it('onEvent no-ops when no state on node', () => {
    const cfg = mkConfig();
    const node = {}; // no state
    const ctx = mkCtx();
    expect(() =>
      buoyancyHandler.onEvent!(node as any, cfg, ctx as any, { type: 'set_fluid_level', level: 5 } as any)
    ).not.toThrow();
  });
});
