import { describe, it, expect, vi } from 'vitest';
import { worldStateHandler } from '../WorldStateTrait';
type Config = NonNullable<Parameters<typeof worldStateHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...worldStateHandler.defaultConfig!, ...o };
}
function mkNode(id = 'world-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  worldStateHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('worldStateHandler — defaultConfig', () => {
  it('sync_interval = 0.1', () => expect(worldStateHandler.defaultConfig?.sync_interval).toBe(0.1));
  it('autosave_interval = 30', () =>
    expect(worldStateHandler.defaultConfig?.autosave_interval).toBe(30));
  it('world_id = default', () => expect(worldStateHandler.defaultConfig?.world_id).toBe('default'));
});

describe('worldStateHandler — onAttach', () => {
  it('creates __worldStateTraitState', () => {
    const { node } = attach();
    expect((node as any).__worldStateTraitState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__worldStateTraitState.active).toBe(true);
  });
  it('emits world_state_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    worldStateHandler.onAttach!(
      node,
      mkCfg({ world_id: 'my-world', max_objects: 5000 }),
      ctx as any
    );
    const ev = ctx.emitted.find((e: any) => e.type === 'world_state_create');
    expect(ev?.payload.worldId).toBe('my-world');
    expect(ev?.payload.maxObjects).toBe(5000);
  });
  it('version initialized to 0', () => {
    const { node } = attach();
    expect((node as any).__worldStateTraitState.version).toBe(0);
  });
});

describe('worldStateHandler — onDetach', () => {
  it('emits world_state_save then world_state_destroy', () => {
    const { node, ctx, cfg } = attach();
    worldStateHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'world_state_save')).toBe(true);
    expect(ctx.emitted.some((e: any) => e.type === 'world_state_destroy')).toBe(true);
  });
  it('save fires before destroy', () => {
    const { node, ctx, cfg } = attach();
    worldStateHandler.onDetach!(node, cfg, ctx as any);
    const saveIdx = ctx.emitted.findIndex((e: any) => e.type === 'world_state_save');
    const destroyIdx = ctx.emitted.findIndex((e: any) => e.type === 'world_state_destroy');
    expect(saveIdx).toBeLessThan(destroyIdx);
  });
  it('removes __worldStateTraitState', () => {
    const { node, ctx, cfg } = attach();
    worldStateHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__worldStateTraitState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => worldStateHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('worldStateHandler — onUpdate', () => {
  it('emits world_state_sync after sync_interval elapses', () => {
    const { node, ctx, cfg } = attach(mkCfg({ sync_interval: 0.1 }));
    worldStateHandler.onUpdate!(node, cfg, ctx as any, 0.15);
    expect(ctx.emitted.some((e: any) => e.type === 'world_state_sync')).toBe(true);
  });
  it('does not sync before interval', () => {
    const { node, ctx, cfg } = attach(mkCfg({ sync_interval: 1.0 }));
    worldStateHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect(ctx.emitted.some((e: any) => e.type === 'world_state_sync')).toBe(false);
  });
  it('emits world_state_save after autosave_interval elapses', () => {
    const { node, ctx, cfg } = attach(mkCfg({ autosave_interval: 1.0 }));
    worldStateHandler.onUpdate!(node, cfg, ctx as any, 1.5);
    expect(ctx.emitted.some((e: any) => e.type === 'world_state_save')).toBe(true);
    const ev = ctx.emitted.find((e: any) => e.type === 'world_state_save');
    expect(ev?.payload.reason).toBe('autosave');
  });
  it('increments version on autosave', () => {
    const { node, ctx, cfg } = attach(mkCfg({ autosave_interval: 0.5 }));
    worldStateHandler.onUpdate!(node, cfg, ctx as any, 0.6);
    expect((node as any).__worldStateTraitState.version).toBe(1);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__worldStateTraitState.active = false;
    worldStateHandler.onUpdate!(node, cfg, ctx as any, 10);
    expect(ctx.emitted.length).toBe(0);
  });
});

describe('worldStateHandler — onEvent', () => {
  it('world_state_object_added increments objectCount and emits update', () => {
    const { node, ctx, cfg } = attach();
    worldStateHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'world_state_object_added',
        objectId: 'obj1',
        data: { mesh: 'cube' },
      } as any
    );
    expect((node as any).__worldStateTraitState.objectCount).toBe(1);
    const ev = ctx.emitted.find((e: any) => e.type === 'world_state_update');
    expect(ev?.payload.action).toBe('add_object');
    expect(ev?.payload.objectId).toBe('obj1');
  });
  it('world_state_object_removed decrements objectCount', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__worldStateTraitState.objectCount = 5;
    worldStateHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'world_state_object_removed',
        objectId: 'obj2',
      } as any
    );
    expect((node as any).__worldStateTraitState.objectCount).toBe(4);
  });
  it('world_state_object_removed does not go below 0', () => {
    const { node, ctx, cfg } = attach();
    worldStateHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'world_state_object_removed',
        objectId: 'x',
      } as any
    );
    expect((node as any).__worldStateTraitState.objectCount).toBe(0);
  });
  it('world_state_terrain_update emits update when persist_terrain is true', () => {
    const { node, ctx, cfg } = attach(mkCfg({ persist_terrain: true }));
    worldStateHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'world_state_terrain_update',
        position: [1, 2, 3],
        delta: 0.5,
      } as any
    );
    const ev = ctx.emitted.find((e: any) => e.type === 'world_state_update');
    expect(ev?.payload.action).toBe('terrain');
  });
  it('world_state_terrain_update skipped when persist_terrain is false', () => {
    const { node, ctx, cfg } = attach(mkCfg({ persist_terrain: false }));
    worldStateHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'world_state_terrain_update',
        position: [0, 0, 0],
      } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'world_state_update')).toBe(false);
  });
  it('world_state_force_save increments version and emits save', () => {
    const { node, ctx, cfg } = attach();
    worldStateHandler.onEvent!(node, cfg, ctx as any, { type: 'world_state_force_save' } as any);
    expect((node as any).__worldStateTraitState.version).toBe(1);
    const ev = ctx.emitted.find((e: any) => e.type === 'world_state_save');
    expect(ev?.payload.reason).toBe('manual');
  });
  it('no-op when no state', () => {
    expect(() =>
      worldStateHandler.onEvent!(
        mkNode() as any,
        mkCfg(),
        mkCtx() as any,
        { type: 'world_state_force_save' } as any
      )
    ).not.toThrow();
  });
});
