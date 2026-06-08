/**
 * SpatialVoiceCoordinator — Production Test Suite
 *
 *  1. Adversarial checks on the distance-attenuation math (bounds, monotonicity,
 *     range culling, rolloff models, pan sign).
 *  2. Integration: mount the REAL SpatialVoiceTrait (active=true), tick one frame,
 *     and assert the coordinator applied a positional gain/pan for the node
 *     bounded by range. Fails on the pre-coordinator code (0 listeners).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import { SpatialVoiceCoordinator, createSpatialVoiceCoordinator } from '../SpatialVoiceCoordinator';
import { attenuationGain, stereoPan, type Vec3 } from '../spatialVoiceAttenuation';
import { spatialVoiceHandler } from '../../../core/src/traits/SpatialVoiceTrait';

// ─── 1. attenuation math ─────────────────────────────────────────────────────

describe('attenuationGain — bounds & culling', () => {
  for (const model of ['linear', 'inverse', 'exponential'] as const) {
    it(`${model}: gain at listener (d=0) is unity`, () => {
      expect(attenuationGain(0, 20, model, 1)).toBeCloseTo(1, 6);
    });
    it(`${model}: gain beyond range is fully culled (0)`, () => {
      expect(attenuationGain(25, 20, model, 1)).toBe(0);
    });
    it(`${model}: gain stays within [0,1] across the range`, () => {
      for (let d = 0; d <= 20; d += 1) {
        const g = attenuationGain(d, 20, model, 1);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
      }
    });
    it(`${model}: gain is monotonically non-increasing with distance`, () => {
      let prev = Infinity;
      for (let d = 0; d < 20; d += 0.5) {
        const g = attenuationGain(d, 20, model, 1);
        expect(g).toBeLessThanOrEqual(prev + 1e-9);
        prev = g;
      }
    });
  }
  it('zero range → only the co-located source is audible', () => {
    expect(attenuationGain(0, 0, 'inverse', 1)).toBe(1);
    expect(attenuationGain(0.1, 0, 'inverse', 1)).toBe(0);
  });
});

describe('stereoPan — direction', () => {
  it('source to the right → positive pan', () => {
    expect(stereoPan([5, 0, 0], [0, 0, 0], 20)).toBeGreaterThan(0);
  });
  it('source to the left → negative pan', () => {
    expect(stereoPan([-5, 0, 0], [0, 0, 0], 20)).toBeLessThan(0);
  });
  it('source straight ahead → centered (0)', () => {
    expect(stereoPan([0, 0, 5], [0, 0, 0], 20)).toBeCloseTo(0, 6);
  });
  it('pan stays within [-1, 1]', () => {
    const p = stereoPan([100, 0, 1], [0, 0, 0], 20);
    expect(p).toBeGreaterThanOrEqual(-1);
    expect(p).toBeLessThanOrEqual(1);
  });
});

// ─── 2. integration with the real SpatialVoiceTrait ──────────────────────────

function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

/** Mount the real trait on a node at `position`, return tick helper. */
function mountTrait(bus: EventBus, position: Vec3) {
  const node: any = { id: 'voice_1', position };
  const ctx = makeTraitContext(bus);
  const cfg = { ...spatialVoiceHandler.defaultConfig! };
  spatialVoiceHandler.onAttach!(node, cfg, ctx as any);
  return {
    node,
    ctx,
    tick: () => spatialVoiceHandler.onUpdate!(node, cfg, ctx as any, 0.016),
  };
}

describe('SpatialVoiceCoordinator — Pattern E wiring', () => {
  it('registers a listener for spatial_voice_position (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('spatial_voice_position')).toBe(0);
    const coord = new SpatialVoiceCoordinator({ bus });
    coord.start();
    expect(bus.listenerCount('spatial_voice_position')).toBeGreaterThan(0);
  });

  it('real trait tick applies a bounded positional gain/pan (the done-when assertion)', () => {
    const bus = new EventBus();
    const coord = createSpatialVoiceCoordinator({ bus, listenerPosition: [0, 0, 0] });

    // Source 10 units to the right, range 20 (default) → audible, panned right.
    const { ctx, tick } = mountTrait(bus, [10, 0, 0]);
    expect(coord.getSpatialization('voice_1')).toBeUndefined();

    tick();

    expect(ctx.emit).toHaveBeenCalledWith('spatial_voice_position', expect.any(Object));
    const s = coord.getSpatialization('voice_1')!;
    expect(s).toBeDefined();
    expect(s.updateCount).toBe(1);
    expect(s.distance).toBeCloseTo(10, 6);
    // Bounded by range: within (0,1] and audible.
    expect(s.gain).toBeGreaterThan(0);
    expect(s.gain).toBeLessThanOrEqual(1);
    expect(s.audible).toBe(true);
    // Positioned to the right.
    expect(s.pan).toBeGreaterThan(0);
  });

  it('source beyond range → culled (gain 0, not audible)', () => {
    const bus = new EventBus();
    const coord = createSpatialVoiceCoordinator({ bus });
    const { tick } = mountTrait(bus, [50, 0, 0]); // beyond default range 20
    tick();
    const s = coord.getSpatialization('voice_1')!;
    expect(s.gain).toBe(0);
    expect(s.audible).toBe(false);
  });

  it('inactive trait (muted) emits nothing → no spatialization', () => {
    const bus = new EventBus();
    const coord = createSpatialVoiceCoordinator({ bus });
    const node: any = { id: 'voice_1', position: [3, 0, 0] };
    const ctx = makeTraitContext(bus);
    const cfg = { ...spatialVoiceHandler.defaultConfig! };
    spatialVoiceHandler.onAttach!(node, cfg, ctx as any);
    node.__spatialVoiceState.active = false;
    spatialVoiceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('spatial_voice_position', expect.any(Object));
    expect(coord.getSpatialization('voice_1')).toBeUndefined();
  });

  it('listener moving closer increases gain on the next tick', () => {
    const bus = new EventBus();
    const coord = createSpatialVoiceCoordinator({ bus });
    const { tick } = mountTrait(bus, [15, 0, 0]);
    tick();
    const far = coord.getSpatialization('voice_1')!.gain;
    coord.setListenerPosition([13, 0, 0]); // 2 units away now
    tick();
    const near = coord.getSpatialization('voice_1')!.gain;
    expect(near).toBeGreaterThan(far);
  });

  it('destroy removes the spatialization record', () => {
    const bus = new EventBus();
    const coord = createSpatialVoiceCoordinator({ bus });
    const { tick } = mountTrait(bus, [5, 0, 0]);
    tick();
    expect(coord.count()).toBe(1);
    bus.emit('spatial_voice_destroy', { nodeId: 'voice_1' });
    expect(coord.count()).toBe(0);
  });
});
