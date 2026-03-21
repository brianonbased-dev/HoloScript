import { describe, it, expect, vi } from 'vitest';
import { volumetricCloudsHandler } from '../VolumetricCloudsTrait';
type Config = NonNullable<Parameters<typeof volumetricCloudsHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...volumetricCloudsHandler.defaultConfig!, ...o };
}
function mkNode(id = 'cloud-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  volumetricCloudsHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('volumetricCloudsHandler — defaultConfig', () => {
  it('altitude = 500', () => expect(volumetricCloudsHandler.defaultConfig?.altitude).toBe(500));
  it('thickness = 200', () => expect(volumetricCloudsHandler.defaultConfig?.thickness).toBe(200));
  it('max_steps = 64', () => expect(volumetricCloudsHandler.defaultConfig?.max_steps).toBe(64));
});

describe('volumetricCloudsHandler — onAttach', () => {
  it('creates __cloudState', () => {
    const { node } = attach();
    expect((node as any).__cloudState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__cloudState.active).toBe(true);
  });
  it('emits volumetric_clouds_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    volumetricCloudsHandler.onAttach!(node, mkCfg({ altitude: 800, max_steps: 128 }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'volumetric_clouds_create');
    expect(ev?.payload.altitude).toBe(800);
    expect(ev?.payload.maxSteps).toBe(128);
  });
  it('windOffset initialized to [0,0,0]', () => {
    const { node } = attach();
    expect((node as any).__cloudState.windOffset).toEqual([0, 0, 0]);
  });
});

describe('volumetricCloudsHandler — onDetach', () => {
  it('emits volumetric_clouds_destroy', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'volumetric_clouds_destroy')).toBe(true);
  });
  it('removes __cloudState', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__cloudState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => volumetricCloudsHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('volumetricCloudsHandler — onUpdate', () => {
  it('emits volumetric_clouds_update each frame', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'volumetric_clouds_update')).toBe(true);
  });
  it('accumulates time', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect((node as any).__cloudState.time).toBeCloseTo(0.5);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__cloudState.active = false;
    volumetricCloudsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'volumetric_clouds_update')).toBe(false);
  });
});

describe('volumetricCloudsHandler — onEvent', () => {
  it('clouds_set_coverage emits update with coverage', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onEvent!(node, cfg, ctx as any, { type: 'clouds_set_coverage', coverage: 0.9 } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'volumetric_clouds_update');
    expect(ev?.payload.coverage).toBe(0.9);
  });
  it('clouds_pause sets active = false', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onEvent!(node, cfg, ctx as any, { type: 'clouds_pause' } as any);
    expect((node as any).__cloudState.active).toBe(false);
  });
  it('clouds_resume sets active = true', () => {
    const { node, ctx, cfg } = attach();
    volumetricCloudsHandler.onEvent!(node, cfg, ctx as any, { type: 'clouds_pause' } as any);
    volumetricCloudsHandler.onEvent!(node, cfg, ctx as any, { type: 'clouds_resume' } as any);
    expect((node as any).__cloudState.active).toBe(true);
  });
  it('no-op when no state', () => {
    expect(() =>
      volumetricCloudsHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'clouds_pause' } as any)
    ).not.toThrow();
  });
});
