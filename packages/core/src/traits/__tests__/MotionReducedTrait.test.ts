import { describe, it, expect, beforeEach } from 'vitest';
import { motionReducedHandler } from '../MotionReducedTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('MotionReducedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    disable_parallax: true,
    reduce_animations: true,
    static_ui: false,
    max_velocity: 2,
    disable_camera_shake: true,
    teleport_instead_of_smooth: true,
    fade_transitions: true,
    auto_detect: true,
  };

  beforeEach(() => {
    node = createMockNode('mr');
    ctx = createMockContext();
    attachTrait(motionReducedHandler, node, cfg, ctx);
  });

  it('initializes inactive', () => {
    expect((node as any).__motionReducedState.isActive).toBe(false);
    expect(getEventCount(ctx, 'motion_reduced_check_system')).toBe(1);
    expect(getEventCount(ctx, 'motion_reduced_register')).toBe(1);
  });

  it('system preference activates when auto_detect', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, {
      type: 'motion_reduced_system_preference',
      prefersReducedMotion: true,
    });
    expect((node as any).__motionReducedState.isActive).toBe(true);
    expect(getEventCount(ctx, 'motion_reduced_apply')).toBe(1);
  });

  it('enable/disable toggles', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_enable' });
    expect((node as any).__motionReducedState.isActive).toBe(true);
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_disable' });
    expect((node as any).__motionReducedState.isActive).toBe(false);
    expect(getEventCount(ctx, 'motion_reduced_restore')).toBe(1);
  });

  it('toggle flips state', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_toggle' });
    expect((node as any).__motionReducedState.isActive).toBe(true);
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_toggle' });
    expect((node as any).__motionReducedState.isActive).toBe(false);
  });

  it('clamps velocity when active', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_enable' });
    (node as any).velocity = [3, 0, 4 ]; // speed = 5
    updateTrait(motionReducedHandler, node, cfg, ctx, 0.016);
    const vel = (node as any).velocity;
    const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    expect(speed).toBeCloseTo(2, 1);
    expect(getEventCount(ctx, 'on_motion_clamped')).toBe(1);
  });

  it('intercepts animation_start when active', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_enable' });
    sendEvent(motionReducedHandler, node, cfg, ctx, {
      type: 'animation_start',
      animationId: 'a1',
      animation: {},
    });
    expect(getEventCount(ctx, 'motion_reduced_replace_animation')).toBe(1);
  });

  it('camera transition converts to teleport', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, { type: 'motion_reduced_enable' });
    sendEvent(motionReducedHandler, node, cfg, ctx, {
      type: 'camera_transition_request',
      target: [1, 2, 3 ],
    });
    expect(getEventCount(ctx, 'camera_teleport')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(motionReducedHandler, node, cfg, ctx, {
      type: 'motion_reduced_query',
      queryId: 'q1',
    });
    const r = getLastEvent(ctx, 'motion_reduced_info') as any;
    expect(r.isActive).toBe(false);
    expect(r.config.maxVelocity).toBe(2);
  });

  it('cleans up on detach', () => {
    motionReducedHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__motionReducedState).toBeUndefined();
    expect(getEventCount(ctx, 'motion_reduced_unregister')).toBe(1);
  });
});
