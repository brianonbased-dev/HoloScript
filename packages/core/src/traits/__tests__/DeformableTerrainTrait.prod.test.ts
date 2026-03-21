import { describe, it, expect, vi } from 'vitest';
import { deformableTerrainHandler } from '../DeformableTerrainTrait';
type Config = NonNullable<Parameters<typeof deformableTerrainHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...deformableTerrainHandler.defaultConfig!, ...o };
}
function mkNode(id = 'terrain-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  deformableTerrainHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('deformableTerrainHandler — defaultConfig', () => {
  it('resolution = 256', () => expect(deformableTerrainHandler.defaultConfig?.resolution).toBe(256));
  it('scale = 100', () => expect(deformableTerrainHandler.defaultConfig?.scale).toBe(100));
  it('thermal_threshold = 45', () => expect(deformableTerrainHandler.defaultConfig?.thermal_threshold).toBe(45));
});

describe('deformableTerrainHandler — onAttach', () => {
  it('creates __terrainState', () => {
    const { node } = attach();
    expect((node as any).__terrainState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__terrainState.active).toBe(true);
  });
  it('emits deformable_terrain_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    deformableTerrainHandler.onAttach!(node, mkCfg({ resolution: 512, scale: 200 }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'deformable_terrain_create');
    expect(ev?.payload.resolution).toBe(512);
    expect(ev?.payload.scale).toBe(200);
  });
  it('totalErosion initialized to 0', () => {
    const { node } = attach();
    expect((node as any).__terrainState.totalErosion).toBe(0);
  });
});

describe('deformableTerrainHandler — onDetach', () => {
  it('emits deformable_terrain_destroy', () => {
    const { node, ctx, cfg } = attach();
    deformableTerrainHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'deformable_terrain_destroy')).toBe(true);
  });
  it('removes __terrainState', () => {
    const { node, ctx, cfg } = attach();
    deformableTerrainHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__terrainState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => deformableTerrainHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('deformableTerrainHandler — onEvent', () => {
  it('terrain_deform emits deformable_terrain_deform with defaults', () => {
    const { node, ctx, cfg } = attach();
    deformableTerrainHandler.onEvent!(node, cfg, ctx as any, {
      type: 'terrain_deform',
      position: [10, 0, 10],
    } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'deformable_terrain_deform');
    expect(ev?.payload.position).toEqual([10, 0, 10]);
    expect(ev?.payload.radius).toBe(5.0);
    expect(ev?.payload.mode).toBe('dig');
  });
  it('terrain_deform respects overridden values', () => {
    const { node, ctx, cfg } = attach();
    deformableTerrainHandler.onEvent!(node, cfg, ctx as any, {
      type: 'terrain_deform',
      position: [0, 0, 0],
      radius: 10,
      strength: 2.0,
      mode: 'raise',
    } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'deformable_terrain_deform');
    expect(ev?.payload.radius).toBe(10);
    expect(ev?.payload.strength).toBe(2.0);
    expect(ev?.payload.mode).toBe('raise');
  });
  it('terrain_reset clears erosion state', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__terrainState.totalErosion = 100;
    (node as any).__terrainState.erosionSteps = 50;
    deformableTerrainHandler.onEvent!(node, cfg, ctx as any, { type: 'terrain_reset' } as any);
    expect((node as any).__terrainState.totalErosion).toBe(0);
    expect((node as any).__terrainState.erosionSteps).toBe(0);
    expect(ctx.emitted.some((e: any) => e.type === 'deformable_terrain_reset')).toBe(true);
  });
  it('no-op when no state', () => {
    expect(() =>
      deformableTerrainHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'terrain_reset' } as any)
    ).not.toThrow();
  });
});
