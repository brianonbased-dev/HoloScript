/**
 * SeatedTrait — Production Test Suite
 *
 * seatedHandler is a TraitHandler<SeatedTrait>. State stored on node.__seatedState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 6 fields
 * 2. onAttach — initialises state, auto_calibrate reads headset Y
 * 3. onDetach — removes state
 * 4. onUpdate — reach calculation, vignette when comfort_vignette=true and out-of-bounds,
 *               height offset applied to node.properties.position
 * 5. onEvent — recalibrate, turn_left/turn_right snap angles, vignette on snap
 */
import { describe, it, expect, vi } from 'vitest';
import { seatedHandler } from '../SeatedTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(posOverride?: any) {
  return {
    id: 'seat_node',
    properties: {
      position: posOverride ?? [0, 1.2, 0],
      rotation: [0, 0, 0],
    },
  };
}

function makeCtx(headPos: [number, number, number] = [0, 1.2, 0], scaleMultiplier = 1) {
  return {
    emit: vi.fn(),
    vr: { headset: { position: headPos } },
    getScaleMultiplier: vi.fn().mockReturnValue(scaleMultiplier),
  };
}

function attach(cfg: Partial<typeof seatedHandler.defaultConfig> = {}, headPos?: [number, number, number]) {
  const node = makeNode();
  const ctx = makeCtx(headPos);
  const config = { ...seatedHandler.defaultConfig!, ...cfg };
  seatedHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('seatedHandler.defaultConfig', () => {
  const d = seatedHandler.defaultConfig!;
  it('height_offset=0', () => expect(d.height_offset).toBe(0));
  it('max_reach=1.0', () => expect(d.max_reach).toBe(1.0));
  it('auto_calibrate=true', () => expect(d.auto_calibrate).toBe(true));
  it('comfort_vignette=true', () => expect(d.comfort_vignette).toBe(true));
  it('snap_turn_angle=45', () => expect(d.snap_turn_angle).toBe(45));
  it('play_bounds=[1.5, 1.5]', () => expect(d.play_bounds).toEqual([1.5, 1.5]));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('seatedHandler.onAttach', () => {
  it('initialises __seatedState on node', () => {
    const { node } = attach();
    expect((node as any).__seatedState).toBeDefined();
  });

  it('auto_calibrate=true: calibratedHeight = headset Y position', () => {
    const { node } = attach({ auto_calibrate: true }, [0, 1.5, 0]);
    const state = (node as any).__seatedState;
    expect(state.calibratedHeight).toBe(1.5);
    expect(state.isCalibrated).toBe(true);
  });

  it('auto_calibrate=false: calibratedHeight stays at default 1.2', () => {
    const { node } = attach({ auto_calibrate: false }, [0, 2.0, 0]);
    const state = (node as any).__seatedState;
    expect(state.calibratedHeight).toBe(1.2);
    expect(state.isCalibrated).toBe(false);
  });

  it('initialises currentReach=0', () => {
    const { node } = attach();
    expect((node as any).__seatedState.currentReach).toBe(0);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('seatedHandler.onDetach', () => {
  it('removes __seatedState from node', () => {
    const { node, config } = attach();
    seatedHandler.onDetach!(node as any, config, {} as any);
    expect((node as any).__seatedState).toBeUndefined();
  });

  it('does not crash if called twice', () => {
    const { node, config } = attach();
    seatedHandler.onDetach!(node as any, config, {} as any);
    expect(() => seatedHandler.onDetach!(node as any, config, {} as any)).not.toThrow();
  });
});

// ─── onUpdate — reach calculation ────────────────────────────────────────────

describe('seatedHandler.onUpdate — reach', () => {
  it('calculates reach = sqrt(dx²+dz²) from origin', () => {
    const node = makeNode([0, 1.2, 0]);
    const ctx = makeCtx([3, 1.2, 4]); // dx=3, dz=4 → reach=5
    const config = { ...seatedHandler.defaultConfig!, max_reach: 10 };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const state = (node as any).__seatedState;
    expect(state.currentReach).toBeCloseTo(5, 2);
  });

  it('emits vignette when reach > max_reach and comfort_vignette=true', () => {
    const node = makeNode([0, 1.2, 0]);
    const ctx = makeCtx([2, 1.2, 0]); // dx=2 → reach=2 > max_reach=1
    const config = { ...seatedHandler.defaultConfig!, max_reach: 1.0, comfort_vignette: true };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    // resistance = min((2-1)/0.5, 1) = 1 > 0.2 → vignette emitted
    expect(ctx.emit).toHaveBeenCalledWith('vignette', expect.objectContaining({ intensity: expect.any(Number) }));
  });

  it('does NOT emit vignette when comfort_vignette=false even when out of reach', () => {
    const node = makeNode([0, 1.2, 0]);
    const ctx = makeCtx([2, 1.2, 0]);
    const config = { ...seatedHandler.defaultConfig!, max_reach: 1.0, comfort_vignette: false };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('vignette', expect.anything());
  });

  it('does NOT emit vignette when within reach bounds', () => {
    const node = makeNode([0, 1.2, 0]);
    const ctx = makeCtx([0.5, 1.2, 0]); // reach=0.5 < max_reach=1.0
    const config = { ...seatedHandler.defaultConfig!, max_reach: 1.0, comfort_vignette: true };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('vignette', expect.anything());
  });

  it('does NOT emit vignette when resistance <= 0.2', () => {
    const node = makeNode([0, 1.2, 0]);
    // max_reach=1.0, reach=1.05 → resistance=min(0.05/0.5,1)=0.1 < 0.2 → no emit
    const ctx = makeCtx([1.05, 1.2, 0]);
    const config = { ...seatedHandler.defaultConfig!, max_reach: 1.0, comfort_vignette: true };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('vignette', expect.anything());
  });
});

// ─── onUpdate — height offset ─────────────────────────────────────────────────

describe('seatedHandler.onUpdate — height offset', () => {
  it('applies calibratedHeight + height_offset to node.properties.position[1]', () => {
    const node = makeNode([0, 0, 0]);
    const ctx = makeCtx([0, 1.4, 0]); // calibrate to 1.4
    const config = { ...seatedHandler.defaultConfig!, auto_calibrate: true, height_offset: 0.1 };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const pos = (node as any).properties.position;
    expect(pos[1]).toBeCloseTo(1.4 + 0.1, 5); // calibratedHeight + offset
  });

  it('negative height_offset lowers the position', () => {
    const node = makeNode([0, 0, 0]);
    const ctx = makeCtx([0, 1.2, 0]);
    const config = { ...seatedHandler.defaultConfig!, auto_calibrate: true, height_offset: -0.2 };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).properties.position[1]).toBeCloseTo(1.0, 5);
  });

  it('no-op gracefully when __seatedState is absent', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = seatedHandler.defaultConfig!;
    // Do NOT call onAttach — state won't exist
    expect(() => seatedHandler.onUpdate!(node as any, config, ctx as any, 0.016)).not.toThrow();
  });
});

// ─── onEvent — recalibrate ────────────────────────────────────────────────────

describe('seatedHandler.onEvent — recalibrate', () => {
  it('updates calibratedHeight from current headset Y and sets isCalibrated=true', () => {
    const node = makeNode([0, 1.2, 0]);
    const ctx = makeCtx([0, 1.2, 0]);
    const config = { ...seatedHandler.defaultConfig!, auto_calibrate: false };
    seatedHandler.onAttach!(node as any, config, ctx as any);
    // Change headset height to 1.7
    (ctx.vr.headset as any).position = [0, 1.7, 0];
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'recalibrate' });
    expect((node as any).__seatedState.calibratedHeight).toBe(1.7);
    expect((node as any).__seatedState.isCalibrated).toBe(true);
  });

  it('emits seated_calibrated with the new height', () => {
    const { node, ctx, config } = attach({ auto_calibrate: false });
    (ctx.vr.headset as any).position = [0, 1.8, 0];
    ctx.emit.mockClear();
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'recalibrate' });
    expect(ctx.emit).toHaveBeenCalledWith('seated_calibrated', { height: 1.8 });
  });
});

// ─── onEvent — snap turn ─────────────────────────────────────────────────────

describe('seatedHandler.onEvent — snap turn', () => {
  it('turn_right rotates by +snap_turn_angle on Y', () => {
    const { node, ctx, config } = attach({ snap_turn_angle: 45 });
    (node as any).properties.rotation = [0, 0, 0];
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'turn_right' });
    expect((node as any).properties.rotation[1]).toBe(45);
  });

  it('turn_left rotates by -snap_turn_angle on Y', () => {
    const { node, ctx, config } = attach({ snap_turn_angle: 45 });
    (node as any).properties.rotation = [0, 90, 0];
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'turn_left' });
    expect((node as any).properties.rotation[1]).toBe(45);
  });

  it('preserves X and Z rotation components', () => {
    const { node, ctx, config } = attach({ snap_turn_angle: 30 });
    (node as any).properties.rotation = [10, 0, 5];
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'turn_right' });
    expect((node as any).properties.rotation[0]).toBe(10);
    expect((node as any).properties.rotation[2]).toBe(5);
  });

  it('emits vignette on snap turn when comfort_vignette=true', () => {
    const { node, ctx, config } = attach({ comfort_vignette: true });
    ctx.emit.mockClear();
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'turn_right' });
    expect(ctx.emit).toHaveBeenCalledWith('vignette', { intensity: 0.3, duration: 200 });
  });

  it('does NOT emit vignette on snap turn when comfort_vignette=false', () => {
    const { node, ctx, config } = attach({ comfort_vignette: false });
    ctx.emit.mockClear();
    seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'turn_right' });
    expect(ctx.emit).not.toHaveBeenCalledWith('vignette', expect.anything());
  });

  it('unknown event type is ignored without crash', () => {
    const { node, ctx, config } = attach();
    expect(() => seatedHandler.onEvent!(node as any, config, ctx as any, { type: 'unknown_event' })).not.toThrow();
  });
});
