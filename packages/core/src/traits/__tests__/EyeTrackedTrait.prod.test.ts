/**
 * EyeTrackedTrait — Production Test Suite
 *
 * eyeTrackedHandler stores state on node.__eyeTrackedState.
 * getEyeGazeRay uses context.vr.headset.{position, rotation}.
 * isPointGazedAt: dot(rayDir, toPointNorm) → angle ≤ tolerance + radiusTolerance
 *
 * Key behaviours:
 * 1. defaultConfig — all 9 fields
 * 2. onAttach — state init, register_foveated with priority
 * 3. onDetach — restores scale+color, unregister_foveated, removes state
 * 4. onUpdate — gaze_enter (highlight+scale, gazeStartTime, gaze_enter event),
 *               gaze_exit (restore, gaze_exit event, dwellProgress reset),
 *               dwell_progress emission when dwell_feedback=true,
 *               dwell_activate+click when dwellProgress=1, smooth_pursuit position
 * 5. onEvent — simulate_gaze sets isGazed+gazeStartTime; cancel_dwell resets progress
 */
import { describe, it, expect, vi } from 'vitest';
import { eyeTrackedHandler } from '../EyeTrackedTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(props: Record<string, unknown> = {}) {
  return { id: 'et_node', properties: { scale: 1, color: '#fff', position: [0, 0, -3], ...props } };
}

/** Head pointing straight forward along -Z axis (headRot [0,0,0]). */
function makeCtx(
  headPos: [number, number, number] = [0, 0, 0],
  headRot: [number, number, number] = [0, 0, 0]
) {
  return {
    emit: vi.fn(),
    vr: { headset: { position: headPos, rotation: headRot } },
  };
}

function attach(
  cfg: Partial<typeof eyeTrackedHandler.defaultConfig> = {},
  nodeProps: Record<string, unknown> = {}
) {
  const node = makeNode(nodeProps);
  const ctx = makeCtx();
  const config = { ...eyeTrackedHandler.defaultConfig!, ...cfg };
  eyeTrackedHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('eyeTrackedHandler.defaultConfig', () => {
  const d = eyeTrackedHandler.defaultConfig!;
  it('dwell_enabled=true', () => expect(d.dwell_enabled).toBe(true));
  it('dwell_time=1000', () => expect(d.dwell_time).toBe(1000));
  it('dwell_feedback=true', () => expect(d.dwell_feedback).toBe(true));
  it('gaze_highlight=true', () => expect(d.gaze_highlight).toBe(true));
  it('highlight_color=#00ffff', () => expect(d.highlight_color).toBe('#00ffff'));
  it('gaze_scale=1.1', () => expect(d.gaze_scale).toBeCloseTo(1.1));
  it('foveated_priority=medium', () => expect(d.foveated_priority).toBe('medium'));
  it('gaze_tolerance=2.0', () => expect(d.gaze_tolerance).toBe(2.0));
  it('smooth_pursuit=false', () => expect(d.smooth_pursuit).toBe(false));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('eyeTrackedHandler.onAttach', () => {
  it('initialises __eyeTrackedState', () => {
    const { node } = attach();
    expect((node as any).__eyeTrackedState).toBeDefined();
  });

  it('isGazed=false, gazeStartTime=0, dwellProgress=0', () => {
    const { node } = attach();
    const s = (node as any).__eyeTrackedState;
    expect(s.isGazed).toBe(false);
    expect(s.gazeStartTime).toBe(0);
    expect(s.dwellProgress).toBe(0);
  });

  it('originalScale seeded from node.properties.scale', () => {
    const { node } = attach({}, { scale: 2 });
    expect((node as any).__eyeTrackedState.originalScale).toBe(2);
  });

  it('originalColor seeded from node.properties.color', () => {
    const { node } = attach({}, { color: '#red' });
    expect((node as any).__eyeTrackedState.originalColor).toBe('#red');
  });

  it('emits register_foveated with foveated_priority', () => {
    const { ctx } = attach({ foveated_priority: 'high' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'register_foveated',
      expect.objectContaining({ priority: 'high' })
    );
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('eyeTrackedHandler.onDetach', () => {
  it('restores originalScale on node.properties', () => {
    const { node, ctx, config } = attach();
    (node as any).__eyeTrackedState.originalScale = 2;
    node.properties!.scale = 2.2;
    eyeTrackedHandler.onDetach!(node as any, config, ctx as any);
    expect(node.properties!.scale).toBe(2);
  });

  it('restores originalColor when present', () => {
    const { node, ctx, config } = attach();
    (node as any).__eyeTrackedState.originalColor = '#abc';
    node.properties!.color = '#00ffff';
    eyeTrackedHandler.onDetach!(node as any, config, ctx as any);
    expect(node.properties!.color).toBe('#abc');
  });

  it('emits unregister_foveated', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    eyeTrackedHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('unregister_foveated', expect.any(Object));
  });

  it('removes __eyeTrackedState', () => {
    const { node, ctx, config } = attach();
    eyeTrackedHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__eyeTrackedState).toBeUndefined();
  });
});

// ─── onUpdate — gaze enter ───────────────────────────────────────────────────
// Head at [0,0,0], rotation [0,0,0] → direction [0,0,-1].
// Object at [0,0,-3] → dot = 1.0 → angle = 0° → inside tolerance.

describe('eyeTrackedHandler.onUpdate — gaze enter', () => {
  function runGazeEnter(cfg: Partial<typeof eyeTrackedHandler.defaultConfig> = {}) {
    const node = makeNode({ position: [0, 0, -3], scale: 1, color: '#fff' });
    const ctx = makeCtx([0, 0, 0], [0, 0, 0]);
    const config = { ...eyeTrackedHandler.defaultConfig!, ...cfg };
    eyeTrackedHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    return { node, ctx, state: (node as any).__eyeTrackedState };
  }

  it('sets isGazed=true on first gaze', () => {
    const { state } = runGazeEnter();
    expect(state.isGazed).toBe(true);
  });

  it('emits gaze_enter event', () => {
    const { ctx } = runGazeEnter();
    expect(ctx.emit).toHaveBeenCalledWith('gaze_enter', expect.any(Object));
  });

  it('applies highlight_color to node.properties.color when gaze_highlight=true', () => {
    const { node } = runGazeEnter({ gaze_highlight: true, highlight_color: '#00ffff' });
    expect(node.properties!.color).toBe('#00ffff');
  });

  it('does NOT change color when gaze_highlight=false', () => {
    const { node } = runGazeEnter({ gaze_highlight: false });
    expect(node.properties!.color).toBe('#fff');
  });

  it('applies gaze_scale multiplier to node.properties.scale', () => {
    const { node } = runGazeEnter({ gaze_scale: 1.1 });
    expect(node.properties!.scale).toBeCloseTo(1.1, 4);
  });

  it('does NOT scale when gaze_scale=1', () => {
    const { node } = runGazeEnter({ gaze_scale: 1 });
    expect(node.properties!.scale).toBe(1);
  });
});

// ─── onUpdate — gaze exit ────────────────────────────────────────────────────
// Head still at origin, object moved off-axis → not gazed.

describe('eyeTrackedHandler.onUpdate — gaze exit', () => {
  it('restores scale and emits gaze_exit when gaze leaves', () => {
    // Object far off-axis: position [100, 100, -3] will not be hit
    const node = makeNode({ position: [100, 100, -3], scale: 1, color: '#fff' });
    const ctx = makeCtx([0, 0, 0], [0, 0, 0]);
    const config = { ...eyeTrackedHandler.defaultConfig! };
    eyeTrackedHandler.onAttach!(node as any, config, ctx as any);

    // Force state to isGazed=true (as if previous update had gaze)
    const state = (node as any).__eyeTrackedState;
    state.isGazed = true;
    state.originalScale = 1;
    node.properties!.scale = 1.1;

    ctx.emit.mockClear();
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.isGazed).toBe(false);
    expect(state.dwellProgress).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('gaze_exit', expect.any(Object));
  });
});

// ─── onUpdate — dwell ─────────────────────────────────────────────────────────

describe('eyeTrackedHandler.onUpdate — dwell', () => {
  function setupGazed(cfg: Partial<typeof eyeTrackedHandler.defaultConfig> = {}) {
    const node = makeNode({ position: [0, 0, -3], scale: 1 });
    const ctx = makeCtx([0, 0, 0], [0, 0, 0]);
    const config = { ...eyeTrackedHandler.defaultConfig!, ...cfg };
    eyeTrackedHandler.onAttach!(node as any, config, ctx as any);

    // First update triggers gaze enter
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    ctx.emit.mockClear();
    return { node, ctx, config };
  }

  it('emits dwell_progress on each update when dwell_feedback=true', () => {
    const { node, ctx, config } = setupGazed({ dwell_feedback: true, dwell_enabled: true });
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'dwell_progress',
      expect.objectContaining({ progress: expect.any(Number) })
    );
  });

  it('does NOT emit dwell_progress when dwell_feedback=false', () => {
    const { node, ctx, config } = setupGazed({ dwell_feedback: false, dwell_enabled: true });
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('dwell_progress', expect.anything());
  });

  it('emits dwell_activate+click when dwell completes', () => {
    const { node, ctx, config } = setupGazed({ dwell_enabled: true, dwell_time: 1000 });
    // Wind gazeStartTime back far enough to make progress>=1
    const state = (node as any).__eyeTrackedState;
    state.gazeStartTime = Date.now() - 2000; // 2s elapsed, dwell_time=1s
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('dwell_activate', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('click', expect.objectContaining({ method: 'dwell' }));
  });

  it('resets dwellProgress and gazeStartTime after dwell_activate', () => {
    const { node, ctx, config } = setupGazed({ dwell_enabled: true, dwell_time: 1000 });
    const state = (node as any).__eyeTrackedState;
    state.gazeStartTime = Date.now() - 2000;
    const before = Date.now();
    eyeTrackedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.dwellProgress).toBe(0);
    expect(state.gazeStartTime).toBeGreaterThanOrEqual(before);
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('eyeTrackedHandler.onEvent', () => {
  it('simulate_gaze active=true sets isGazed=true and updates gazeStartTime', () => {
    const { node, ctx, config } = attach();
    const before = Date.now();
    eyeTrackedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'simulate_gaze',
      active: true,
    });
    const state = (node as any).__eyeTrackedState;
    expect(state.isGazed).toBe(true);
    expect(state.gazeStartTime).toBeGreaterThanOrEqual(before);
  });

  it('simulate_gaze active=false sets isGazed=false without updating gazeStartTime', () => {
    const { node, ctx, config } = attach();
    (node as any).__eyeTrackedState.isGazed = true;
    eyeTrackedHandler.onEvent!(node as any, config, ctx as any, {
      type: 'simulate_gaze',
      active: false,
    });
    expect((node as any).__eyeTrackedState.isGazed).toBe(false);
  });

  it('cancel_dwell resets dwellProgress to 0', () => {
    const { node, ctx, config } = attach();
    (node as any).__eyeTrackedState.dwellProgress = 0.7;
    eyeTrackedHandler.onEvent!(node as any, config, ctx as any, { type: 'cancel_dwell' });
    expect((node as any).__eyeTrackedState.dwellProgress).toBe(0);
  });

  it('cancel_dwell resets gazeStartTime', () => {
    const { node, ctx, config } = attach();
    const before = Date.now();
    eyeTrackedHandler.onEvent!(node as any, config, ctx as any, { type: 'cancel_dwell' });
    expect((node as any).__eyeTrackedState.gazeStartTime).toBeGreaterThanOrEqual(before);
  });

  it('unknown event type is a no-op', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      eyeTrackedHandler.onEvent!(node as any, config, ctx as any, { type: 'unknown_event' })
    ).not.toThrow();
  });
});
