import { describe, it, expect, vi } from 'vitest';
import { godRaysHandler } from '../GodRaysTrait';
type Config = NonNullable<Parameters<typeof godRaysHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...godRaysHandler.defaultConfig!, ...o };
}
function mkNode(id = 'godray-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  godRaysHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('godRaysHandler — defaultConfig', () => {
  it('decay = 0.96', () => expect(godRaysHandler.defaultConfig?.decay).toBe(0.96));
  it('samples = 100', () => expect(godRaysHandler.defaultConfig?.samples).toBe(100));
  it('light_position = [100, 200, 100]', () =>
    expect(godRaysHandler.defaultConfig?.light_position).toEqual([100, 200, 100]));
});

describe('godRaysHandler — onAttach', () => {
  it('creates __godRaysActive flag', () => {
    const { node } = attach();
    expect((node as any).__godRaysActive).toBe(true);
  });
  it('emits god_rays_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    godRaysHandler.onAttach!(node, mkCfg({ decay: 0.9, samples: 64 }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'god_rays_create');
    expect(ev?.payload.decay).toBe(0.9);
    expect(ev?.payload.samples).toBe(64);
  });
  it('emits god_rays_create with exposure and weight', () => {
    const node = mkNode();
    const ctx = mkCtx();
    godRaysHandler.onAttach!(node, mkCfg(), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'god_rays_create');
    expect(ev?.payload.exposure).toBe(0.3);
    expect(ev?.payload.weight).toBe(0.5);
  });
});

describe('godRaysHandler — onDetach', () => {
  it('emits god_rays_destroy', () => {
    const { node, ctx, cfg } = attach();
    godRaysHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'god_rays_destroy')).toBe(true);
  });
  it('removes __godRaysActive', () => {
    const { node, ctx, cfg } = attach();
    godRaysHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__godRaysActive).toBeUndefined();
  });
  it('no-op when not active', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => godRaysHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
    expect(ctx.emitted.length).toBe(0);
  });
});

describe('godRaysHandler — onUpdate', () => {
  it('emits god_rays_update when use_weather is true', () => {
    const { node, ctx, cfg } = attach();
    godRaysHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'god_rays_update')).toBe(true);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__godRaysActive = false;
    godRaysHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'god_rays_update')).toBe(false);
  });
});

describe('godRaysHandler — onEvent', () => {
  it('god_rays_set_params emits update with overridden values', () => {
    const { node, ctx, cfg } = attach();
    godRaysHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'god_rays_set_params', decay: 0.8, exposure: 0.5 } as any
    );
    const ev = ctx.emitted.find((e: any) => e.type === 'god_rays_update');
    expect(ev?.payload.decay).toBe(0.8);
    expect(ev?.payload.exposure).toBe(0.5);
  });
  it('god_rays_set_params uses config defaults for missing fields', () => {
    const { node, ctx, cfg } = attach();
    godRaysHandler.onEvent!(node, cfg, ctx as any, { type: 'god_rays_set_params' } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'god_rays_update');
    expect(ev?.payload.decay).toBe(0.96);
    expect(ev?.payload.weight).toBe(0.5);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__godRaysActive = false;
    godRaysHandler.onEvent!(node, cfg, ctx as any, { type: 'god_rays_set_params' } as any);
    expect(ctx.emitted.length).toBe(0);
  });
});
