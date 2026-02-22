/**
 * PatrolTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { patrolHandler } from '../PatrolTrait';

const WP = (x: number, y = 0, z = 0, extra: any = {}) => ({ x, y, z, ...extra });
function makeNode(pos = { x: 0, y: 0, z: 0 }) { return { id: 'p_node', position: { ...pos } }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}, pos = { x: 0, y: 0, z: 0 }) {
  const node = makeNode(pos);
  const ctx = makeCtx();
  const config = { ...patrolHandler.defaultConfig!, ...cfg };
  patrolHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

describe('patrolHandler.defaultConfig', () => {
  const d = patrolHandler.defaultConfig!;
  it('waypoints=[]', () => expect(d.waypoints).toEqual([]));
  it('mode=loop', () => expect(d.mode).toBe('loop'));
  it('speed=2', () => expect(d.speed).toBe(2));
  it('wait_time=2', () => expect(d.wait_time).toBe(2));
  it('alert_on_detection=true', () => expect(d.alert_on_detection).toBe(true));
  it('resume_after_alert=true', () => expect(d.resume_after_alert).toBe(true));
  it('alert_wait_time=5', () => expect(d.alert_wait_time).toBe(5));
  it('look_ahead=true', () => expect(d.look_ahead).toBe(true));
});

describe('patrolHandler.onAttach', () => {
  it('creates __patrolState', () => expect(attach().node.__patrolState).toBeDefined());
  it('currentIndex=0', () => expect(attach().node.__patrolState.currentIndex).toBe(0));
  it('direction=1', () => expect(attach().node.__patrolState.direction).toBe(1));
  it('isPaused=false', () => expect(attach().node.__patrolState.isPaused).toBe(false));
  it('isWaiting=false', () => expect(attach().node.__patrolState.isWaiting).toBe(false));
  it('isAlerted=false', () => expect(attach().node.__patrolState.isAlerted).toBe(false));
  it('completed=false', () => expect(attach().node.__patrolState.completed).toBe(false));
  it('emits patrol_started when waypoints provided', () => {
    const { ctx } = attach({ waypoints: [WP(1), WP(2)] });
    expect(ctx.emit).toHaveBeenCalledWith('patrol_started', expect.objectContaining({ waypoints: 2 }));
  });
  it('no patrol_started when no waypoints', () => {
    const { ctx } = attach({ waypoints: [] });
    expect(ctx.emit).not.toHaveBeenCalledWith('patrol_started', expect.anything());
  });
});

describe('patrolHandler.onDetach', () => {
  it('removes __patrolState', () => {
    const { node, config, ctx } = attach();
    patrolHandler.onDetach!(node, config, ctx);
    expect(node.__patrolState).toBeUndefined();
  });
});

describe('patrolHandler.onUpdate — movement', () => {
  it('emits set_position when moving toward waypoint', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10, 0, 0)], speed: 2, look_ahead: false });
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).toHaveBeenCalledWith('set_position', expect.anything());
  });

  it('reaches close waypoint and emits patrol_waypoint_reached', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(0.1, 0, 0)], speed: 10, wait_time: 0 });
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('patrol_waypoint_reached', expect.objectContaining({ waypointIndex: 0 }));
  });

  it('no-op when paused', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10)] });
    node.__patrolState.isPaused = true;
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalledWith('set_position', expect.anything());
  });

  it('no-op when no waypoints', () => {
    const { node, config, ctx } = attach({ waypoints: [] });
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalledWith('set_position', expect.anything());
  });

  it('no-op when completed', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10)], mode: 'once' });
    node.__patrolState.completed = true;
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalledWith('set_position', expect.anything());
  });

  it('emits set_rotation when look_ahead=true and moving', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10, 0, 10)], speed: 0.1, look_ahead: true });
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 0.01);
    expect(ctx.emit).toHaveBeenCalledWith('set_rotation', expect.anything());
  });

  it('no set_rotation when look_ahead=false', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10)], speed: 0.1, look_ahead: false });
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 0.01);
    expect(ctx.emit).not.toHaveBeenCalledWith('set_rotation', expect.anything());
  });
});

describe('patrolHandler.onUpdate — alert', () => {
  it('timer counts down and emits patrol_alert_ended', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10)], alert_wait_time: 1 });
    node.__patrolState.isAlerted = true;
    node.__patrolState.waitTimer = 0;
    ctx.emit.mockClear();
    patrolHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('patrol_alert_ended', expect.anything());
    expect(node.__patrolState.isAlerted).toBe(false);
  });

  it('pauses after alert when resume_after_alert=false', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10)], alert_wait_time: 1, resume_after_alert: false });
    node.__patrolState.isAlerted = true;
    node.__patrolState.waitTimer = 0;
    patrolHandler.onUpdate!(node, config, ctx, 2);
    expect(node.__patrolState.isPaused).toBe(true);
  });

  it('continues patrol when resume_after_alert=true', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(10)], alert_wait_time: 1, resume_after_alert: true });
    node.__patrolState.isAlerted = true;
    node.__patrolState.waitTimer = 0;
    patrolHandler.onUpdate!(node, config, ctx, 2);
    expect(node.__patrolState.isPaused).toBe(false);
  });
});

describe('patrolHandler — once mode', () => {
  it('marks completed after reaching last waypoint', () => {
    const wps = [WP(0.01), WP(5)];
    const { node, config, ctx } = attach({ waypoints: wps, mode: 'once', speed: 100, wait_time: 0 });
    node.__patrolState.currentIndex = 1;
    patrolHandler.onUpdate!(node, config, ctx, 1); // reach it
    patrolHandler.onUpdate!(node, config, ctx, 0.001); // finish wait
    expect(node.__patrolState.completed).toBe(true);
  });
});

describe('patrolHandler.onEvent — pause / resume', () => {
  it('patrol_pause sets isPaused=true and emits patrol_paused', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_pause' });
    expect(node.__patrolState.isPaused).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('patrol_paused', expect.anything());
  });

  it('patrol_resume sets isPaused=false and emits patrol_resumed', () => {
    const { node, config, ctx } = attach();
    node.__patrolState.isPaused = true;
    ctx.emit.mockClear();
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_resume' });
    expect(node.__patrolState.isPaused).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('patrol_resumed', expect.anything());
  });
});

describe('patrolHandler.onEvent — patrol_alert', () => {
  it('sets isAlerted=true and emits patrol_alerted', () => {
    const { node, config, ctx } = attach({ alert_on_detection: true });
    ctx.emit.mockClear();
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_alert', position: { x: 5, y: 0, z: 5 } });
    expect(node.__patrolState.isAlerted).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('patrol_alerted', expect.anything());
  });

  it('no-op when alert_on_detection=false', () => {
    const { node, config, ctx } = attach({ alert_on_detection: false });
    ctx.emit.mockClear();
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_alert', position: { x: 5, y: 0, z: 5 } });
    expect(node.__patrolState.isAlerted).toBe(false);
  });
});

describe('patrolHandler.onEvent — patrol_goto', () => {
  it('sets currentIndex to target waypoint', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(0), WP(5), WP(10)] });
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_goto', waypointIndex: 2 });
    expect(node.__patrolState.currentIndex).toBe(2);
    expect(node.__patrolState.isWaiting).toBe(false);
  });

  it('ignores out-of-bounds index', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(0), WP(5)] });
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_goto', waypointIndex: 99 });
    expect(node.__patrolState.currentIndex).toBe(0);
  });
});

describe('patrolHandler.onEvent — patrol_reset', () => {
  it('resets all state fields', () => {
    const { node, config, ctx } = attach({ waypoints: [WP(0), WP(5)] });
    node.__patrolState.currentIndex = 2;
    node.__patrolState.direction = -1;
    node.__patrolState.isPaused = true;
    node.__patrolState.isAlerted = true;
    node.__patrolState.completed = true;
    patrolHandler.onEvent!(node, config, ctx, { type: 'patrol_reset' });
    expect(node.__patrolState.currentIndex).toBe(0);
    expect(node.__patrolState.direction).toBe(1);
    expect(node.__patrolState.isPaused).toBe(false);
    expect(node.__patrolState.isAlerted).toBe(false);
    expect(node.__patrolState.completed).toBe(false);
    expect(node.__patrolState.visitedSet.size).toBe(0);
  });
});
