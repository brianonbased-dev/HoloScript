import { describe, it, expect, vi } from 'vitest';
import { antiGriefHandler } from '../AntiGriefTrait';
type Config = NonNullable<Parameters<typeof antiGriefHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...antiGriefHandler.defaultConfig!, ...o };
}
function mkNode(id = 'grief-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  antiGriefHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('antiGriefHandler — defaultConfig', () => {
  it('sensitivity = 0.5', () => expect(antiGriefHandler.defaultConfig?.sensitivity).toBe(0.5));
  it('shield_threshold = 0.7', () => expect(antiGriefHandler.defaultConfig?.shield_threshold).toBe(0.7));
  it('kill_threshold = 5', () => expect(antiGriefHandler.defaultConfig?.kill_threshold).toBe(5));
});

describe('antiGriefHandler — onAttach', () => {
  it('creates __antiGriefState', () => {
    const { node } = attach();
    expect((node as any).__antiGriefState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__antiGriefState.active).toBe(true);
  });
  it('emits anti_grief_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    antiGriefHandler.onAttach!(node, mkCfg({ sensitivity: 0.8, shield_color: '#ff0000' }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'anti_grief_create');
    expect(ev?.payload.sensitivity).toBe(0.8);
    expect(ev?.payload.shieldColor).toBe('#ff0000');
  });
  it('players map starts empty', () => {
    const { node } = attach();
    expect((node as any).__antiGriefState.players.size).toBe(0);
  });
});

describe('antiGriefHandler — onDetach', () => {
  it('emits anti_grief_destroy', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'anti_grief_destroy')).toBe(true);
  });
  it('removes __antiGriefState', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__antiGriefState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => antiGriefHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('antiGriefHandler — onEvent', () => {
  it('player_kill records kill timestamp', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onEvent!(node, cfg, ctx as any, {
      type: 'player_kill',
      killerId: 'griefer1',
    } as any);
    const record = (node as any).__antiGriefState.players.get('griefer1');
    expect(record).toBeDefined();
    expect(record.kills.length).toBe(1);
  });
  it('object_destroyed records destruction timestamp', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onEvent!(node, cfg, ctx as any, {
      type: 'object_destroyed',
      destroyerId: 'griefer2',
    } as any);
    const record = (node as any).__antiGriefState.players.get('griefer2');
    expect(record.destructions.length).toBe(1);
  });
  it('player_report records report', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onEvent!(node, cfg, ctx as any, {
      type: 'player_report',
      reportedId: 'suspect',
    } as any);
    const record = (node as any).__antiGriefState.players.get('suspect');
    expect(record.reports.length).toBe(1);
  });
  it('anti_grief_shield_player activates shield and emits event', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onEvent!(node, cfg, ctx as any, {
      type: 'anti_grief_shield_player',
      playerId: 'victim1',
    } as any);
    expect((node as any).__antiGriefState.shieldedPlayers.has('victim1')).toBe(true);
    const ev = ctx.emitted.find((e: any) => e.type === 'anti_grief_shield_activated');
    expect(ev?.payload.playerId).toBe('victim1');
    expect(ev?.payload.duration).toBe(30);
  });
  it('anti_grief_reset clears all tracking data', () => {
    const { node, ctx, cfg } = attach();
    antiGriefHandler.onEvent!(node, cfg, ctx as any, { type: 'player_kill', killerId: 'x' } as any);
    antiGriefHandler.onEvent!(node, cfg, ctx as any, {
      type: 'anti_grief_shield_player',
      playerId: 'y',
    } as any);
    ctx.emitted.length = 0;
    antiGriefHandler.onEvent!(node, cfg, ctx as any, { type: 'anti_grief_reset' } as any);
    expect((node as any).__antiGriefState.players.size).toBe(0);
    expect((node as any).__antiGriefState.shieldedPlayers.size).toBe(0);
  });
  it('no-op when no state', () => {
    expect(() =>
      antiGriefHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'player_kill' } as any)
    ).not.toThrow();
  });
});
