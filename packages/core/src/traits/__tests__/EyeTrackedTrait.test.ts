import { describe, it, expect, beforeEach } from 'vitest';
import { eyeTrackedHandler } from '../EyeTrackedTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

function createVRMockContext() {
  const ctx = createMockContext();
  (ctx as any).vr = {
    headset: {
      position: [0, 1.6, 0],
      rotation: [0, 0, 0],
    },
  };
  return ctx;
}

describe('EyeTrackedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    dwell_enabled: true,
    dwell_time: 1000,
    dwell_feedback: true,
    gaze_highlight: true,
    highlight_color: '#00ffff',
    gaze_scale: 1.1,
    foveated_priority: 'medium' as const,
    gaze_tolerance: 2.0,
    smooth_pursuit: false,
  };

  beforeEach(() => {
    node = createMockNode('eye');
    (node as any).properties = { position: [0, 1.6, -2], scale: 1, color: '#ffffff' };
    ctx = createVRMockContext();
    attachTrait(eyeTrackedHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__eyeTrackedState;
    expect(state).toBeDefined();
    expect(state.isGazed).toBe(false);
    expect(state.dwellProgress).toBe(0);
    expect(state.originalScale).toBe(1);
  });

  it('emits register_foveated on attach', () => {
    expect(getEventCount(ctx, 'register_foveated')).toBe(1);
  });

  it('simulate_gaze activates gaze state', () => {
    sendEvent(eyeTrackedHandler, node, cfg, ctx, { type: 'simulate_gaze', active: true });
    expect((node as any).__eyeTrackedState.isGazed).toBe(true);
  });

  it('simulate_gaze deactivates gaze state', () => {
    sendEvent(eyeTrackedHandler, node, cfg, ctx, { type: 'simulate_gaze', active: true });
    sendEvent(eyeTrackedHandler, node, cfg, ctx, { type: 'simulate_gaze', active: false });
    expect((node as any).__eyeTrackedState.isGazed).toBe(false);
  });

  it('cancel_dwell resets progress', () => {
    sendEvent(eyeTrackedHandler, node, cfg, ctx, { type: 'simulate_gaze', active: true });
    const state = (node as any).__eyeTrackedState;
    state.dwellProgress = 0.5;
    sendEvent(eyeTrackedHandler, node, cfg, ctx, { type: 'cancel_dwell' });
    expect(state.dwellProgress).toBe(0);
  });

  it('detach restores properties and emits unregister', () => {
    eyeTrackedHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__eyeTrackedState).toBeUndefined();
    expect(getEventCount(ctx, 'unregister_foveated')).toBe(1);
  });
});
