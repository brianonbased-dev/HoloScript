import { describe, it, expect, vi } from 'vitest';
import { crowdSimHandler } from '../CrowdSimTrait';
type Config = NonNullable<Parameters<typeof crowdSimHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...crowdSimHandler.defaultConfig!, ...o };
}
function mkNode(id = 'crowd-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  crowdSimHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('crowdSimHandler — defaultConfig', () => {
  it('max_agents = 1000', () => expect(crowdSimHandler.defaultConfig?.max_agents).toBe(1000));
  it('speed = 1.5', () => expect(crowdSimHandler.defaultConfig?.speed).toBe(1.5));
  it('separation_weight = 1.5', () => expect(crowdSimHandler.defaultConfig?.separation_weight).toBe(1.5));
});

describe('crowdSimHandler — onAttach', () => {
  it('creates __crowdSimState', () => {
    const { node } = attach();
    expect((node as any).__crowdSimState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__crowdSimState.active).toBe(true);
  });
  it('emits crowd_sim_create with flocking weights', () => {
    const node = mkNode();
    const ctx = mkCtx();
    crowdSimHandler.onAttach!(node, mkCfg({ separation_weight: 2.0, alignment_weight: 1.5 }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'crowd_sim_create');
    expect(ev?.payload.flocking.separation).toBe(2.0);
    expect(ev?.payload.flocking.alignment).toBe(1.5);
  });
  it('agentCount initialized to 0', () => {
    const { node } = attach();
    expect((node as any).__crowdSimState.agentCount).toBe(0);
  });
});

describe('crowdSimHandler — onDetach', () => {
  it('emits crowd_sim_destroy', () => {
    const { node, ctx, cfg } = attach();
    crowdSimHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'crowd_sim_destroy')).toBe(true);
  });
  it('removes __crowdSimState', () => {
    const { node, ctx, cfg } = attach();
    crowdSimHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__crowdSimState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => crowdSimHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('crowdSimHandler — onUpdate', () => {
  it('emits crowd_sim_step with deltaTime', () => {
    const { node, ctx, cfg } = attach();
    crowdSimHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const ev = ctx.emitted.find((e: any) => e.type === 'crowd_sim_step');
    expect(ev?.payload.deltaTime).toBe(0.016);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__crowdSimState.active = false;
    crowdSimHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'crowd_sim_step')).toBe(false);
  });
});

describe('crowdSimHandler — onEvent', () => {
  it('crowd_spawn_agents increases agentCount and emits spawn', () => {
    const { node, ctx, cfg } = attach();
    crowdSimHandler.onEvent!(node, cfg, ctx as any, {
      type: 'crowd_spawn_agents',
      count: 50,
      position: [0, 0, 0],
    } as any);
    expect((node as any).__crowdSimState.agentCount).toBe(50);
    const ev = ctx.emitted.find((e: any) => e.type === 'crowd_sim_spawn');
    expect(ev?.payload.count).toBe(50);
  });
  it('crowd_spawn_agents clamps to max_agents', () => {
    const { node, ctx, cfg } = attach(mkCfg({ max_agents: 100 }));
    crowdSimHandler.onEvent!(node, cfg, ctx as any, { type: 'crowd_spawn_agents', count: 150 } as any);
    expect((node as any).__crowdSimState.agentCount).toBe(100);
  });
  it('crowd_set_goal stores goal and emits crowd_sim_goal', () => {
    const { node, ctx, cfg } = attach();
    crowdSimHandler.onEvent!(node, cfg, ctx as any, {
      type: 'crowd_set_goal',
      groupId: 'alpha',
      position: [10, 0, 10],
    } as any);
    expect((node as any).__crowdSimState.goals.get('alpha')).toEqual([10, 0, 10]);
    const ev = ctx.emitted.find((e: any) => e.type === 'crowd_sim_goal');
    expect(ev?.payload.groupId).toBe('alpha');
  });
  it('crowd_clear resets agentCount and goals', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__crowdSimState.agentCount = 50;
    (node as any).__crowdSimState.goals.set('test', [1, 2, 3]);
    crowdSimHandler.onEvent!(node, cfg, ctx as any, { type: 'crowd_clear' } as any);
    expect((node as any).__crowdSimState.agentCount).toBe(0);
    expect((node as any).__crowdSimState.goals.size).toBe(0);
    expect(ctx.emitted.some((e: any) => e.type === 'crowd_sim_clear')).toBe(true);
  });
  it('no-op when no state', () => {
    expect(() =>
      crowdSimHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'crowd_clear' } as any)
    ).not.toThrow();
  });
});
