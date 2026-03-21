import { describe, it, expect, vi } from 'vitest';
import { softBodyProHandler } from '../SoftBodyProTrait';
type Config = NonNullable<Parameters<typeof softBodyProHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...softBodyProHandler.defaultConfig!, ...o };
}
function mkNode(id = 'softbody-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  softBodyProHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('softBodyProHandler — defaultConfig', () => {
  it('tear_threshold = 0.8', () => expect(softBodyProHandler.defaultConfig?.tear_threshold).toBe(0.8));
  it('solver_iterations = 10', () => expect(softBodyProHandler.defaultConfig?.solver_iterations).toBe(10));
  it('damping = 0.99', () => expect(softBodyProHandler.defaultConfig?.damping).toBe(0.99));
});

describe('softBodyProHandler — onAttach', () => {
  it('creates __softBodyProState', () => {
    const { node } = attach();
    expect((node as any).__softBodyProState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__softBodyProState.active).toBe(true);
  });
  it('emits soft_body_pro_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    softBodyProHandler.onAttach!(node, mkCfg({ tear_threshold: 0.5, solver_iterations: 20 }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'soft_body_pro_create');
    expect(ev?.payload.tearThreshold).toBe(0.5);
    expect(ev?.payload.solverIterations).toBe(20);
  });
  it('tornConstraints initialized to 0', () => {
    const { node } = attach();
    expect((node as any).__softBodyProState.tornConstraints).toBe(0);
  });
});

describe('softBodyProHandler — onDetach', () => {
  it('emits soft_body_pro_destroy', () => {
    const { node, ctx, cfg } = attach();
    softBodyProHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'soft_body_pro_destroy')).toBe(true);
  });
  it('removes __softBodyProState', () => {
    const { node, ctx, cfg } = attach();
    softBodyProHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__softBodyProState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => softBodyProHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('softBodyProHandler — onUpdate', () => {
  it('emits soft_body_pro_step with deltaTime', () => {
    const { node, ctx, cfg } = attach();
    softBodyProHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const ev = ctx.emitted.find((e: any) => e.type === 'soft_body_pro_step');
    expect(ev?.payload.deltaTime).toBe(0.016);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__softBodyProState.active = false;
    softBodyProHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'soft_body_pro_step')).toBe(false);
  });
});

describe('softBodyProHandler — onEvent', () => {
  it('soft_body_pro_tear_report updates state and emits on_soft_body_tear', () => {
    const { node, ctx, cfg } = attach();
    softBodyProHandler.onEvent!(node, cfg, ctx as any, {
      type: 'soft_body_pro_tear_report',
      tornCount: 5,
      totalCount: 100,
    } as any);
    expect((node as any).__softBodyProState.tornConstraints).toBe(5);
    const ev = ctx.emitted.find((e: any) => e.type === 'on_soft_body_tear');
    expect(ev?.payload.tearRatio).toBeCloseTo(0.05);
  });
  it('soft_body_pro_apply_force emits impulse event', () => {
    const { node, ctx, cfg } = attach();
    softBodyProHandler.onEvent!(node, cfg, ctx as any, {
      type: 'soft_body_pro_apply_force',
      position: [1, 2, 3],
      force: [0, 10, 0],
      radius: 2.0,
    } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'soft_body_pro_impulse');
    expect(ev?.payload.radius).toBe(2.0);
  });
  it('soft_body_pro_reset clears torn constraints and deformation', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__softBodyProState.tornConstraints = 10;
    (node as any).__softBodyProState.deformation = 5;
    softBodyProHandler.onEvent!(node, cfg, ctx as any, { type: 'soft_body_pro_reset' } as any);
    expect((node as any).__softBodyProState.tornConstraints).toBe(0);
    expect((node as any).__softBodyProState.deformation).toBe(0);
    expect(ctx.emitted.some((e: any) => e.type === 'soft_body_pro_reset')).toBe(true);
  });
  it('no-op when no state', () => {
    expect(() =>
      softBodyProHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'soft_body_pro_reset' } as any)
    ).not.toThrow();
  });
});
