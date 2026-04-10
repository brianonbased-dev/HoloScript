import { describe, it, expect, vi } from 'vitest';
import { fluidHandler } from '../FluidTrait';
type FluidConfig = NonNullable<Parameters<typeof fluidHandler.onAttach>[1]>;
function mkCfg(o: Partial<FluidConfig> = {}): FluidConfig {
  return { ...fluidHandler.defaultConfig!, ...o };
}
function mkNode(id = 'fluid-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  fluidHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('fluidHandler — defaultConfig', () => {
  it('method = mls_mpm', () => expect(fluidHandler.defaultConfig?.method).toBe('mls_mpm'));
  it('particle_count = 50000', () =>
    expect(fluidHandler.defaultConfig?.particle_count).toBe(50000));
  it('viscosity = 0.01', () => expect(fluidHandler.defaultConfig?.viscosity).toBe(0.01));
  it('render_mode = ssfr', () => expect(fluidHandler.defaultConfig?.render_mode).toBe('ssfr'));
  it('gravity = [0,-9.81,0]', () =>
    expect(fluidHandler.defaultConfig?.gravity).toEqual([0, -9.81, 0]));
});

describe('fluidHandler — onAttach', () => {
  it('creates __fluidState', () => {
    const { node } = attach();
    expect((node as any).__fluidState).toBeDefined();
  });
  it('isSimulating = true after attach', () => {
    const { node } = attach();
    expect((node as any).__fluidState.isSimulating).toBe(true);
  });
  it('emits fluid_create with method and config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    fluidHandler.onAttach!(node, mkCfg({ method: 'flip', particle_count: 5000 }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'fluid_create');
    expect(ev?.payload.method).toBe('flip');
    expect(ev?.payload.maxParticles).toBe(5000);
  });
  it('emitters map is empty', () => {
    const { node } = attach();
    expect((node as any).__fluidState.emitters.size).toBe(0);
  });
  it('particleCount = 0', () => {
    const { node } = attach();
    expect((node as any).__fluidState.particleCount).toBe(0);
  });
});

describe('fluidHandler — onDetach', () => {
  it('emits fluid_destroy when simulating', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_destroy')).toBe(true);
  });
  it('removes __fluidState', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__fluidState).toBeUndefined();
  });
  it('no fluid_destroy when not simulating', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__fluidState.isSimulating = false;
    fluidHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_destroy')).toBe(false);
  });
});

describe('fluidHandler — onUpdate', () => {
  it('emits fluid_step each update when simulating', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_step')).toBe(true);
  });
  it('fluid_step has correct deltaTime', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onUpdate!(node, cfg, ctx as any, 0.033);
    const ev = ctx.emitted.find((e: any) => e.type === 'fluid_step');
    expect(ev?.payload.deltaTime).toBe(0.033);
  });
  it('no-op when not simulating', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__fluidState.isSimulating = false;
    fluidHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_step')).toBe(false);
  });
  it('emits fluid_emit_particles for active emitters', () => {
    const { node, ctx, cfg } = attach(mkCfg({ particle_count: 1000 }));
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'fluid_add_emitter',
        emitterId: 'e1',
        rate: 100,
        position: { x: 0, y: 5, z: 0 },
        velocity: { x: 0, y: -1, z: 0 },
      } as any
    );
    ctx.emitted.length = 0;
    fluidHandler.onUpdate!(node, cfg, ctx as any, 0.1); // 100 * 0.1 = 10 particles
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_emit_particles')).toBe(true);
  });
});

describe('fluidHandler — onEvent: emitters', () => {
  it('fluid_add_emitter adds to emitters map', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'fluid_add_emitter',
        emitterId: 'src1',
        rate: 50,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: -1, z: 0 },
      } as any
    );
    expect((node as any).__fluidState.emitters.has('src1')).toBe(true);
  });
  it('fluid_add_emitter auto-generates id when none given', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(node, cfg, ctx as any, { type: 'fluid_add_emitter', rate: 50 } as any);
    expect((node as any).__fluidState.emitters.size).toBe(1);
  });
  it('fluid_remove_emitter removes from map', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_add_emitter', emitterId: 'del_me', rate: 50 } as any
    );
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_remove_emitter', emitterId: 'del_me' } as any
    );
    expect((node as any).__fluidState.emitters.has('del_me')).toBe(false);
  });
});

describe('fluidHandler — onEvent: particle_update', () => {
  it('updates particleCount and volume', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'fluid_particle_update',
        particleCount: 500,
        volume: 1.5,
        positions: [],
        velocities: [],
      } as any
    );
    expect((node as any).__fluidState.particleCount).toBe(500);
    expect((node as any).__fluidState.volume).toBe(1.5);
  });
  it('emits fluid_render_update', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'fluid_particle_update',
        particleCount: 100,
        volume: 1.0,
        positions: [],
        velocities: [],
      } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_render_update')).toBe(true);
  });
});

describe('fluidHandler — onEvent: splash', () => {
  it('emits fluid_apply_impulse', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_splash', position: { x: 0, y: 0, z: 0 }, force: 20, radius: 1.0 } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_apply_impulse')).toBe(true);
  });
  it('emits on_fluid_splash', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_splash', position: { x: 1, y: 0, z: 1 }, force: 10 } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'on_fluid_splash')).toBe(true);
  });
});

describe('fluidHandler — onEvent: bounds/pause/resume/reset/viscosity/query', () => {
  it('fluid_set_bounds updates boundingBox and emits fluid_update_bounds', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_set_bounds', min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_update_bounds')).toBe(true);
    expect((node as any).__fluidState.boundingBox.min.x).toBe(-5);
  });
  it('fluid_pause sets isSimulating=false', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(node, cfg, ctx as any, { type: 'fluid_pause' } as any);
    expect((node as any).__fluidState.isSimulating).toBe(false);
  });
  it('fluid_resume sets isSimulating=true', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(node, cfg, ctx as any, { type: 'fluid_pause' } as any);
    fluidHandler.onEvent!(node, cfg, ctx as any, { type: 'fluid_resume' } as any);
    expect((node as any).__fluidState.isSimulating).toBe(true);
  });
  it('fluid_reset clears particles/volume/emitters and emits fluid_clear', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__fluidState.particleCount = 500;
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_add_emitter', emitterId: 'e1', rate: 50 } as any
    );
    ctx.emitted.length = 0;
    fluidHandler.onEvent!(node, cfg, ctx as any, { type: 'fluid_reset' } as any);
    expect((node as any).__fluidState.particleCount).toBe(0);
    expect((node as any).__fluidState.emitters.size).toBe(0);
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_clear')).toBe(true);
  });
  it('fluid_set_viscosity emits fluid_update_params', () => {
    const { node, ctx, cfg } = attach();
    fluidHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'fluid_set_viscosity', viscosity: 0.5 } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'fluid_update_params')).toBe(true);
  });
  it('fluid_query emits fluid_info with correct state', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__fluidState.particleCount = 200;
    fluidHandler.onEvent!(node, cfg, ctx as any, { type: 'fluid_query', queryId: 'q1' } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'fluid_info');
    expect(ev?.payload.particleCount).toBe(200);
    expect(ev?.payload.isSimulating).toBe(true);
    expect(ev?.payload.queryId).toBe('q1');
  });
  it('no-op when no state', () => {
    expect(() =>
      fluidHandler.onEvent!(
        mkNode() as any,
        mkCfg(),
        mkCtx() as any,
        { type: 'fluid_pause' } as any
      )
    ).not.toThrow();
  });
});
