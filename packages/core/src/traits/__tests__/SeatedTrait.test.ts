import { describe, it, expect, beforeEach } from 'vitest';
import { seatedHandler } from '../SeatedTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
} from './traitTestHelpers';

/**
 * SeatedTrait uses context.vr.headset.position and context.getScaleMultiplier().
 * We need a custom mock context with VR fields.
 */
function createSeatedMockContext() {
  const ctx = createMockContext();
  (ctx as any).vr = {
    headset: {
      position: [0, 1.2, 0],
      rotation: [0, 0, 0, 1],
    },
  };
  (ctx as any).getScaleMultiplier = () => 1.0;
  return ctx;
}

describe('SeatedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    height_offset: 0,
    max_reach: 1.0,
    auto_calibrate: true,
    comfort_vignette: true,
    snap_turn_angle: 45,
    play_bounds: [1.5, 1.5] as [number, number],
  };

  beforeEach(() => {
    node = createMockNode('seated');
    (node as any).properties = { position: [0, 0, 0], rotation: [0, 0, 0] };
    ctx = createSeatedMockContext();
    attachTrait(seatedHandler, node, cfg, ctx);
  });

  it('initializes state with auto_calibrate', () => {
    const state = (node as any).__seatedState;
    expect(state).toBeDefined();
    expect(state.isCalibrated).toBe(true);
    expect(state.calibratedHeight).toBe(1.2);
  });

  it('recalibrate event updates height', () => {
    (ctx as any).vr.headset.position = [0, 1.5, 0];
    sendEvent(seatedHandler, node, cfg, ctx, { type: 'recalibrate' });
    expect((node as any).__seatedState.calibratedHeight).toBe(1.5);
    expect(getEventCount(ctx, 'seated_calibrated')).toBe(1);
  });

  it('turn_right event rotates node', () => {
    sendEvent(seatedHandler, node, cfg, ctx, { type: 'turn_right' });
    expect((node as any).properties.rotation[1]).toBe(45);
    expect(getEventCount(ctx, 'vignette')).toBe(1);
  });

  it('turn_left event rotates node negatively', () => {
    sendEvent(seatedHandler, node, cfg, ctx, { type: 'turn_left' });
    expect((node as any).properties.rotation[1]).toBe(-45);
  });

  it('detach cleans up', () => {
    seatedHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__seatedState).toBeUndefined();
  });
});
