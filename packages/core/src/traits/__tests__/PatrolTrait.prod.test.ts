import { describe, it, expect, vi } from 'vitest';
import { patrolHandler } from '../PatrolTrait';
type PatrolConfig = NonNullable<Parameters<typeof patrolHandler.onAttach>[1]>;
function mkCfg(o: Partial<PatrolConfig> = {}): PatrolConfig { return { ...patrolHandler.defaultConfig!, ...o }; }
function mkNode(pos = { x: 0, y: 0, z: 0 }) { return { position: pos } as any; }
function mkCtx() { const e: any[] = []; return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any }; }
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) { patrolHandler.onAttach!(node, cfg, ctx as any); ctx.emitted.length = 0; return { node, ctx, cfg }; }
const wA = { x: 0, y: 0, z: 0 }, wB = { x: 10, y: 0, z: 0 }, wC = { x: 10, y: 0, z: 10 };

describe('patrolHandler — defaultConfig', () => {
  it('mode loop', () => expect(patrolHandler.defaultConfig?.mode).toBe('loop'));
  it('speed 2', () => expect(patrolHandler.defaultConfig?.speed).toBe(2));
  it('wait_time 2', () => expect(patrolHandler.defaultConfig?.wait_time).toBe(2));
  it('alert_on_detection true', () => expect(patrolHandler.defaultConfig?.alert_on_detection).toBe(true));
  it('resume_after_alert true', () => expect(patrolHandler.defaultConfig?.resume_after_alert).toBe(true));
});

describe('patrolHandler — attach/detach', () => {
  it('creates __patrolState', () => { const { node } = attach(); expect((node as any).__patrolState).toBeDefined(); });
  it('currentIndex = 0', () => { const { node } = attach(); expect((node as any).__patrolState.currentIndex).toBe(0); });
  it('isPaused = false', () => { const { node } = attach(); expect((node as any).__patrolState.isPaused).toBe(false); });
  it('emits patrol_started with waypoints', () => {
    const node = mkNode(); const ctx = mkCtx();
    patrolHandler.onAttach!(node, mkCfg({ waypoints: [wA] }), ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'patrol_started')).toBe(true);
  });
  it('no patrol_started when empty', () => {
    const node = mkNode(); const ctx = mkCtx();
    patrolHandler.onAttach!(node, mkCfg({ waypoints: [] }), ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'patrol_started')).toBe(false);
  });
  it('removes __patrolState on detach', () => {
    const { node, ctx, cfg } = attach();
    patrolHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__patrolState).toBeUndefined();
  });
});

describe('patrolHandler — onUpdate movement', () => {
  it('emits set_position while moving', () => {
    const cfg = mkCfg({ waypoints: [wA, wB], speed: 5, wait_time: 0 });
    const { node, ctx } = attach(cfg, mkNode({ x: 0, y: 0, z: 0 }));
    patrolHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect(ctx.emitted.some((e: any) => e.type === 'set_position')).toBe(true);
  });
  it('emits patrol_waypoint_reached at speed > dist', () => {
    const cfg = mkCfg({ waypoints: [wA, wB], speed: 100, wait_time: 0 });
    const { node, ctx } = attach(cfg, mkNode({ x: 9.9, y: 0, z: 0 }));
    patrolHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect(ctx.emitted.some((e: any) => e.type === 'patrol_waypoint_reached')).toBe(true);
  });
  it('no-op when empty waypoints', () => {
    const cfg = mkCfg({ waypoints: [] });
    const { node, ctx } = attach(cfg);
    patrolHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted).toHaveLength(0);
  });
  it('emits set_rotation with look_ahead=true', () => {
    // waypoint[0] = {x:5,y:0,z:0}; node starts at x=-2 so there's actual movement to produce a direction
    const cfg = mkCfg({ waypoints: [{ x: 5, y: 0, z: 0 }], speed: 1, wait_time: 0, look_ahead: true });
    const { node, ctx } = attach(cfg, mkNode({ x: -2, y: 0, z: 0 }));
    patrolHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect(ctx.emitted.some((e: any) => e.type === 'set_rotation')).toBe(true);
  });
  it('no-op when paused', () => {
    const cfg = mkCfg({ waypoints: [wA, wB], speed: 5 });
    const { node, ctx } = attach(cfg);
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_pause' } as any);
    ctx.emitted.length = 0;
    patrolHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted).toHaveLength(0);
  });
});

describe('patrolHandler — events', () => {
  it('patrol_pause sets isPaused=true + emits patrol_paused', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA, wB] }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_pause' } as any);
    expect((node as any).__patrolState.isPaused).toBe(true);
    expect(ctx.emitted.some((e: any) => e.type === 'patrol_paused')).toBe(true);
  });
  it('patrol_resume clears pause', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA, wB] }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_pause' } as any);
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_resume' } as any);
    expect((node as any).__patrolState.isPaused).toBe(false);
  });
  it('patrol_alert sets isAlerted when alert_on_detection=true', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA], alert_on_detection: true }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_alert', position: { x: 5, y: 0, z: 0 } } as any);
    expect((node as any).__patrolState.isAlerted).toBe(true);
  });
  it('patrol_alert no-op when alert_on_detection=false', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA], alert_on_detection: false }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_alert', position: { x: 5, y: 0, z: 0 } } as any);
    expect((node as any).__patrolState.isAlerted).toBe(false);
  });
  it('patrol_goto valid index updates currentIndex', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA, wB, wC] }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_goto', waypointIndex: 2 } as any);
    expect((node as any).__patrolState.currentIndex).toBe(2);
  });
  it('patrol_goto out-of-range ignored', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA, wB] }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_goto', waypointIndex: 99 } as any);
    expect((node as any).__patrolState.currentIndex).toBe(0);
  });
  it('patrol_reset clears all state flags', () => {
    const { node, ctx, cfg } = attach(mkCfg({ waypoints: [wA, wB] }));
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_pause' } as any);
    patrolHandler.onEvent!(node, cfg, ctx as any, { type: 'patrol_reset' } as any);
    const s = (node as any).__patrolState;
    expect(s.currentIndex).toBe(0);
    expect(s.isPaused).toBe(false);
    expect(s.isAlerted).toBe(false);
    expect(s.completed).toBe(false);
  });
  it('no-op when no state', () => {
    expect(() => patrolHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'patrol_pause' } as any)).not.toThrow();
  });
});

describe('patrolHandler — once mode completion', () => {
  it('marks completed after last waypoint traversed', () => {
    const cfg = mkCfg({ waypoints: [wA, wB], mode: 'once', speed: 100, wait_time: 0 });
    const { node, ctx } = attach(cfg, mkNode({ x: 9.9, y: 0, z: 0 }));
    for (let i = 0; i < 5; i++) patrolHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    expect((node as any).__patrolState.completed).toBe(true);
  });
});
