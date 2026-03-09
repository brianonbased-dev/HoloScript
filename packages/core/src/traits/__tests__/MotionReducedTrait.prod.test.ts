/**
 * MotionReducedTrait — Production Test Suite
 *
 * motionReducedHandler stores state on node.__motionReducedState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 8 fields
 * 2. onAttach — state init, auto_detect emits check_system, always emits register
 * 3. onDetach — emits restore when isActive + animations stored, always emits unregister
 * 4. onUpdate — velocity clamping + on_motion_clamped event, velocityBuffer management
 * 5. onEvent — system_preference, enable/disable/toggle, animation_start intercept,
 *              camera_transition_request → teleport, motion_reduced_query
 */
import { describe, it, expect, vi } from 'vitest';
import { motionReducedHandler } from '../MotionReducedTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(extras: Record<string, any> = {}) {
  return { id: 'mr_node', properties: {}, ...extras };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof motionReducedHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...motionReducedHandler.defaultConfig!, ...cfg };
  motionReducedHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('motionReducedHandler.defaultConfig', () => {
  const d = motionReducedHandler.defaultConfig!;
  it('disable_parallax=true', () => expect(d.disable_parallax).toBe(true));
  it('reduce_animations=true', () => expect(d.reduce_animations).toBe(true));
  it('static_ui=false', () => expect(d.static_ui).toBe(false));
  it('max_velocity=2', () => expect(d.max_velocity).toBe(2));
  it('disable_camera_shake=true', () => expect(d.disable_camera_shake).toBe(true));
  it('teleport_instead_of_smooth=true', () => expect(d.teleport_instead_of_smooth).toBe(true));
  it('fade_transitions=true', () => expect(d.fade_transitions).toBe(true));
  it('auto_detect=true', () => expect(d.auto_detect).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('motionReducedHandler.onAttach', () => {
  it('initialises __motionReducedState on node', () => {
    const { node } = attach();
    expect((node as any).__motionReducedState).toBeDefined();
  });

  it('state: isActive=false initially', () => {
    const { node } = attach();
    expect((node as any).__motionReducedState.isActive).toBe(false);
  });

  it('state: velocityBuffer is empty array', () => {
    const { node } = attach();
    expect((node as any).__motionReducedState.velocityBuffer).toEqual([]);
  });

  it('auto_detect=true → emits motion_reduced_check_system', () => {
    const { ctx } = attach({ auto_detect: true });
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_check_system', expect.any(Object));
  });

  it('auto_detect=false → does NOT emit motion_reduced_check_system', () => {
    const { ctx } = attach({ auto_detect: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('motion_reduced_check_system', expect.anything());
  });

  it('always emits motion_reduced_register', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_register', expect.any(Object));
  });

  it('register payload includes config fields', () => {
    const { ctx } = attach({ max_velocity: 3, fade_transitions: false });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'motion_reduced_register');
    expect(call![1].config.maxVelocity).toBe(3);
    expect(call![1].config.fadeTransitions).toBe(false);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('motionReducedHandler.onDetach', () => {
  it('always emits motion_reduced_unregister', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    motionReducedHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_unregister', expect.any(Object));
  });

  it('removes __motionReducedState', () => {
    const { node, ctx, config } = attach();
    motionReducedHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__motionReducedState).toBeUndefined();
  });

  it('emits motion_reduced_restore when isActive and animations stored', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__motionReducedState;
    state.isActive = true;
    state.originalAnimations.set('anim1', {});
    ctx.emit.mockClear();
    motionReducedHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_restore', expect.any(Object));
  });

  it('does NOT emit motion_reduced_restore when not active', () => {
    const { node, ctx, config } = attach();
    // isActive is false by default
    ctx.emit.mockClear();
    motionReducedHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('motion_reduced_restore', expect.anything());
  });
});

// ─── onUpdate — velocity clamping ────────────────────────────────────────────

describe('motionReducedHandler.onUpdate — velocity clamping', () => {
  it('no-op when isActive=false', () => {
    const { node, ctx, config } = attach();
    (node as any).velocity = { x: 10, y: 10, z: 10 };
    ctx.emit.mockClear();
    motionReducedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('clamps velocity magnitude to max_velocity and emits on_motion_clamped', () => {
    const { node, ctx, config } = attach({ max_velocity: 2 });
    const state = (node as any).__motionReducedState;
    state.isActive = true;
    // velocity magnitude = sqrt(4+4+4) ≈ 3.46 > 2
    (node as any).velocity = { x: 2, y: 2, z: 2 };
    ctx.emit.mockClear();
    motionReducedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const speed = Math.sqrt(12);
    const scale = 2 / speed;
    expect((node as any).velocity.x).toBeCloseTo(2 * scale, 5);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_motion_clamped',
      expect.objectContaining({ clampedSpeed: 2 })
    );
  });

  it('does NOT clamp velocity when within max_velocity', () => {
    const { node, ctx, config } = attach({ max_velocity: 5 });
    const state = (node as any).__motionReducedState;
    state.isActive = true;
    (node as any).velocity = { x: 1, y: 1, z: 1 }; // speed ≈ 1.73 < 5
    ctx.emit.mockClear();
    motionReducedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('on_motion_clamped', expect.anything());
  });

  it('does NOT crash when no velocity on node', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__motionReducedState;
    state.isActive = true;
    expect(() =>
      motionReducedHandler.onUpdate!(node as any, config, ctx as any, 0.016)
    ).not.toThrow();
  });

  it('caps velocityBuffer at 10 entries', () => {
    const { node, ctx, config } = attach({ disable_camera_shake: true });
    const state = (node as any).__motionReducedState;
    state.isActive = true;
    (node as any).position = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 15; i++) {
      motionReducedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    }
    expect(state.velocityBuffer.length).toBeLessThanOrEqual(10);
  });
});

// ─── onEvent — system_preference ──────────────────────────────────────────────

describe('motionReducedHandler.onEvent — system_preference', () => {
  it('sets systemPreference from event', () => {
    const { node, ctx, config } = attach({ auto_detect: true });
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_system_preference',
      prefersReducedMotion: true,
    });
    expect((node as any).__motionReducedState.systemPreference).toBe(true);
  });

  it('auto_detect=true + prefers=true → isActive=true + applies motion reduction', () => {
    const { node, ctx, config } = attach({ auto_detect: true });
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_system_preference',
      prefersReducedMotion: true,
    });
    expect((node as any).__motionReducedState.isActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_apply', expect.any(Object));
  });

  it('auto_detect=false → does NOT activate even when prefers=true', () => {
    const { node, ctx, config } = attach({ auto_detect: false });
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_system_preference',
      prefersReducedMotion: true,
    });
    expect((node as any).__motionReducedState.isActive).toBe(false);
  });
});

// ─── onEvent — enable/disable/toggle ──────────────────────────────────────────

describe('motionReducedHandler.onEvent — enable/disable/toggle', () => {
  it('motion_reduced_enable → isActive=true + emits apply', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_enable',
    });
    expect((node as any).__motionReducedState.isActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_apply', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('on_motion_reduce', {
      node: expect.anything(),
      enabled: true,
    });
  });

  it('motion_reduced_disable → isActive=false + emits restore + on_motion_reduce false', () => {
    const { node, ctx, config } = attach();
    (node as any).__motionReducedState.isActive = true;
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_disable',
    });
    expect((node as any).__motionReducedState.isActive).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_motion_reduce', {
      node: expect.anything(),
      enabled: false,
    });
  });

  it('motion_reduced_toggle: off→on emits apply', () => {
    const { node, ctx, config } = attach(); // starts false
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_toggle',
    });
    expect((node as any).__motionReducedState.isActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('motion_reduced_apply', expect.any(Object));
  });

  it('motion_reduced_toggle: on→off emits restore', () => {
    const { node, ctx, config } = attach();
    (node as any).__motionReducedState.isActive = true;
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_toggle',
    });
    expect((node as any).__motionReducedState.isActive).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_motion_reduce', {
      node: expect.anything(),
      enabled: false,
    });
  });
});

// ─── onEvent — animation_start intercept ─────────────────────────────────────

describe('motionReducedHandler.onEvent — animation_start', () => {
  it('stores animation in originalAnimations when active + reduce_animations=true', () => {
    const { node, ctx, config } = attach({ reduce_animations: true });
    (node as any).__motionReducedState.isActive = true;
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'animation_start',
      animationId: 'walk',
      animation: { speed: 1 },
    });
    expect((node as any).__motionReducedState.originalAnimations.get('walk')).toEqual({ speed: 1 });
  });

  it('emits motion_reduced_replace_animation with fade flag', () => {
    const { node, ctx, config } = attach({ reduce_animations: true, fade_transitions: true });
    (node as any).__motionReducedState.isActive = true;
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'animation_start',
      animationId: 'jump',
      animation: {},
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'motion_reduced_replace_animation',
      expect.objectContaining({
        animationId: 'jump',
        useFade: true,
      })
    );
  });

  it('does NOT intercept when isActive=false', () => {
    const { node, ctx, config } = attach({ reduce_animations: true });
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'animation_start',
      animationId: 'idle',
      animation: {},
    });
    expect(ctx.emit).not.toHaveBeenCalledWith(
      'motion_reduced_replace_animation',
      expect.anything()
    );
  });
});

// ─── onEvent — camera_transition_request ────────────────────────────────────

describe('motionReducedHandler.onEvent — camera_transition_request', () => {
  it('converts to camera_teleport when active + teleport=true', () => {
    const { node, ctx, config } = attach({
      teleport_instead_of_smooth: true,
      fade_transitions: true,
    });
    (node as any).__motionReducedState.isActive = true;
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'camera_transition_request',
      target: { x: 10, y: 0, z: 0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'camera_teleport',
      expect.objectContaining({
        fade: true,
        fadeDuration: 200,
      })
    );
  });

  it('does NOT emit camera_teleport when isActive=false', () => {
    const { node, ctx, config } = attach({ teleport_instead_of_smooth: true });
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'camera_transition_request',
      target: {},
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('camera_teleport', expect.anything());
  });
});

// ─── onEvent — query ──────────────────────────────────────────────────────────

describe('motionReducedHandler.onEvent — motion_reduced_query', () => {
  it('emits motion_reduced_info with snapshot', () => {
    const { node, ctx, config } = attach({ max_velocity: 3 });
    (node as any).__motionReducedState.isActive = true;
    ctx.emit.mockClear();
    motionReducedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'motion_reduced_query',
      queryId: 'q1',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'motion_reduced_info');
    expect(call![1].isActive).toBe(true);
    expect(call![1].queryId).toBe('q1');
    expect(call![1].config.maxVelocity).toBe(3);
  });
});
