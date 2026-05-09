import { describe, it, expect, beforeEach } from 'vitest';
import { eyeTrackedHandler } from '../EyeTrackedTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
} from './traitTestHelpers';

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

  // ─── Eye-gaze adapter + device gating ───────────────────────────────────────

  it('registers foveated with fixed mode on attach (no eye tracking yet)', () => {
    const events = (ctx as any).emittedEvents.filter(
      (e: any) => e.event === 'register_foveated'
    );
    expect(events[0].data.foveationMode).toBe('fixed');
    expect(events[0].data.eyeTrackingAvailable).toBe(false);
  });

  it('caches eye_gaze_update in state', () => {
    sendEvent(eyeTrackedHandler, node, cfg, ctx, {
      type: 'eye_gaze_update',
      origin: [0, 1.6, 0],
      direction: [0, 0, -1],
    });
    const state = (node as any).__eyeTrackedState;
    expect(state.eyeGazeRay).toBeDefined();
    expect(state.eyeGazeRay.origin).toEqual([0, 1.6, 0]);
    expect(state.eyeGazeRay.direction).toEqual([0, 0, -1]);
    expect(state.hasRealEyeTracking).toBe(true);
  });

  it('switches to eye_gaze_driven foveation on first eye_gaze_update', () => {
    sendEvent(eyeTrackedHandler, node, cfg, ctx, {
      type: 'eye_gaze_update',
      origin: [0, 1.6, 0],
      direction: [0, 0, -1],
    });
    const events = (ctx as any).emittedEvents.filter(
      (e: any) => e.event === 'register_foveated'
    );
    expect(events.length).toBe(2); // initial fixed + upgrade to eye_gaze_driven
    expect(events[1].data.foveationMode).toBe('eye_gaze_driven');
    expect(events[1].data.eyeTrackingAvailable).toBe(true);
  });

  it('uses real eye gaze for gaze detection when available', () => {
    // Object at [0, 1.6, -2]; head is at [0, 1.6, 0] facing straight.
    // With head rotation, object is gazed. With eye gaze looking up-right, it's not.
    sendEvent(eyeTrackedHandler, node, cfg, ctx, {
      type: 'eye_gaze_update',
      origin: [0, 1.6, 0],
      direction: [0.5, 0.5, -0.5], // looking up-right
    });
    eyeTrackedHandler.onUpdate?.(node as any, cfg as any, ctx as any, 0.016);
    const state = (node as any).__eyeTrackedState;
    expect(state.isGazed).toBe(false); // up-right misses the object at [0,1.6,-2]
  });

  it('falls back to head rotation when eye gaze data is absent', () => {
    // No eye_gaze_update received; head rotation is straight forward
    eyeTrackedHandler.onUpdate?.(node as any, cfg as any, ctx as any, 0.016);
    const state = (node as any).__eyeTrackedState;
    expect(state.isGazed).toBe(true); // head rotation hits object at [0,1.6,-2]
  });
});
