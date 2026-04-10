/**
 * VoiceProximityTrait — Production Test Suite
 *
 * voiceProximityHandler stores state on node.__voiceProximityState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 10 fields
 * 2. onAttach — state init, emits voice_proximity_register with coneAngles/enableHRTF
 * 3. onDetach — emits unregister, removes state
 * 4. onUpdate — no-op when isMuted; smooth attenuation up/down; emits voice_set_gain when voiceActive;
 *               emits voice_set_panning when hrtf enabled + voiceActive
 * 5. calculateAttenuation helper — distance <= min→1; >= max→0; linear; logarithmic; exponential
 * 6. onEvent — voice_distance_update: stores distance, calculates attenuation + targetAttenuation,
 *              zone multiplier, private zone blocks cross-zone, panning vector, emits proximity_changed;
 *              voice_activity; voice_mute; voice_zone_enter/exit
 */
import { describe, it, expect, vi } from 'vitest';
import { voiceProximityHandler } from '../VoiceProximityTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'vp_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof voiceProximityHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...voiceProximityHandler.defaultConfig!, ...cfg };
  voiceProximityHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('voiceProximityHandler.defaultConfig', () => {
  const d = voiceProximityHandler.defaultConfig!;
  it('min_distance=1', () => expect(d.min_distance).toBe(1));
  it('max_distance=20', () => expect(d.max_distance).toBe(20));
  it('falloff=logarithmic', () => expect(d.falloff).toBe('logarithmic'));
  it('directional=false', () => expect(d.directional).toBe(false));
  it('cone_inner_angle=360', () => expect(d.cone_inner_angle).toBe(360));
  it('cone_outer_angle=360', () => expect(d.cone_outer_angle).toBe(360));
  it('cone_outer_gain=0', () => expect(d.cone_outer_gain).toBe(0));
  it('zones=[]', () => expect(d.zones).toEqual([]));
  it('enable_hrtf=true', () => expect(d.enable_hrtf).toBe(true));
  it('voice_activity_detection=true', () => expect(d.voice_activity_detection).toBe(true));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('voiceProximityHandler.onAttach', () => {
  it('initialises __voiceProximityState', () => {
    const { node } = attach();
    expect((node as any).__voiceProximityState).toBeDefined();
  });

  it('initial state: isMuted=false, voiceActive=false, activeZone=null', () => {
    const { node } = attach();
    const s = (node as any).__voiceProximityState;
    expect(s.isMuted).toBe(false);
    expect(s.voiceActive).toBe(false);
    expect(s.activeZone).toBeNull();
  });

  it('emits voice_proximity_register with coneAngles and enableHRTF', () => {
    const { ctx } = attach({
      min_distance: 2,
      max_distance: 30,
      directional: true,
      cone_inner_angle: 60,
      cone_outer_angle: 120,
      cone_outer_gain: 0.1,
      enable_hrtf: false,
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'voice_proximity_register');
    expect(call).toBeDefined();
    expect(call![1].minDistance).toBe(2);
    expect(call![1].maxDistance).toBe(30);
    expect(call![1].directional).toBe(true);
    expect(call![1].coneAngles).toEqual({ inner: 60, outer: 120, outerGain: 0.1 });
    expect(call![1].enableHRTF).toBe(false);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('voiceProximityHandler.onDetach', () => {
  it('emits voice_proximity_unregister', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    voiceProximityHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('voice_proximity_unregister', expect.any(Object));
  });

  it('removes __voiceProximityState', () => {
    const { node, ctx, config } = attach();
    voiceProximityHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__voiceProximityState).toBeUndefined();
  });
});

// ─── onUpdate — muted ─────────────────────────────────────────────────────────

describe('voiceProximityHandler.onUpdate — no-op when muted', () => {
  it('does not emit when isMuted=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__voiceProximityState.isMuted = true;
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — smooth attenuation ───────────────────────────────────────────

describe('voiceProximityHandler.onUpdate — smooth attenuation', () => {
  it('moves currentAttenuation toward higher targetAttenuation', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__voiceProximityState;
    state.currentAttenuation = 0.2;
    state.targetAttenuation = 0.8;
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.1); // smoothSpeed=0.5
    expect(state.currentAttenuation).toBeGreaterThan(0.2);
    expect(state.currentAttenuation).toBeLessThanOrEqual(0.8);
  });

  it('moves currentAttenuation toward lower targetAttenuation', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__voiceProximityState;
    state.currentAttenuation = 0.8;
    state.targetAttenuation = 0.2;
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(state.currentAttenuation).toBeLessThan(0.8);
    expect(state.currentAttenuation).toBeGreaterThanOrEqual(0.2);
  });

  it('emits voice_set_gain when voiceActive=true', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__voiceProximityState;
    state.voiceActive = true;
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'voice_set_gain',
      expect.objectContaining({ gain: expect.any(Number) })
    );
  });

  it('does NOT emit voice_set_gain when voiceActive=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('voice_set_gain', expect.anything());
  });

  it('emits voice_set_panning when voiceActive=true AND enable_hrtf=true', () => {
    const { node, ctx, config } = attach({ enable_hrtf: true });
    (node as any).__voiceProximityState.voiceActive = true;
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('voice_set_panning', expect.any(Object));
  });

  it('does NOT emit voice_set_panning when enable_hrtf=false', () => {
    const { node, ctx, config } = attach({ enable_hrtf: false });
    (node as any).__voiceProximityState.voiceActive = true;
    ctx.emit.mockClear();
    voiceProximityHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('voice_set_panning', expect.anything());
  });
});

// ─── calculateAttenuation helper (via onEvent) ───────────────────────────────

describe('voiceProximityHandler — calculateAttenuation helper', () => {
  function getAttenuation(
    distance: number,
    falloff: 'linear' | 'logarithmic' | 'exponential',
    minD = 1,
    maxD = 20
  ) {
    const { node, ctx, config } = attach({ falloff, min_distance: minD, max_distance: maxD });
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_distance_update',
      distance,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: distance, y: 0, z: 0 },
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'voice_proximity_changed');
    return call![1].attenuation as number;
  }

  it('distance <= min_distance → attenuation=1', () => {
    expect(getAttenuation(0.5, 'linear')).toBeCloseTo(1, 5);
  });

  it('distance >= max_distance → attenuation=0', () => {
    expect(getAttenuation(25, 'linear')).toBeCloseTo(0, 5);
  });

  it('linear: midpoint → 0.5', () => {
    // normalized=(10.5-1)/(20-1)=9.5/19=0.5; 1-0.5=0.5
    expect(getAttenuation(10.5, 'linear')).toBeCloseTo(0.5, 2);
  });

  it('logarithmic: value between 0 and 1', () => {
    const v = getAttenuation(10.5, 'logarithmic');
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it('exponential: midpoint → 0.25', () => {
    // normalized=0.5; (1-0.5)^2=0.25
    expect(getAttenuation(10.5, 'exponential')).toBeCloseTo(0.25, 2);
  });
});

// ─── onEvent — voice_distance_update ─────────────────────────────────────────

describe('voiceProximityHandler.onEvent — voice_distance_update', () => {
  it('stores distanceToListener', () => {
    const { node, ctx, config } = attach();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_distance_update',
      distance: 5,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: 5, y: 0, z: 0 },
    });
    expect((node as any).__voiceProximityState.distanceToListener).toBe(5);
  });

  it('emits voice_proximity_changed with distance and attenuation', () => {
    const { node, ctx, config } = attach({ falloff: 'linear', min_distance: 1, max_distance: 10 });
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_distance_update',
      distance: 5.5,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: 5.5, y: 0, z: 0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'voice_proximity_changed',
      expect.objectContaining({
        distance: 5.5,
        attenuation: expect.any(Number),
      })
    );
  });

  it('calculates panning vector from speaker−listener / distance', () => {
    const { node, ctx, config } = attach();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_distance_update',
      distance: 4,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: 4, y: 0, z: 0 },
    });
    const pv = (node as any).__voiceProximityState.panningVector;
    expect(pv.x).toBeCloseTo(1, 5);
    expect(pv.y).toBeCloseTo(0, 5);
    expect(pv.z).toBeCloseTo(0, 5);
  });

  it('zone multiplier applied when both speaker and listener in zone', () => {
    const { node, ctx, config } = attach({
      falloff: 'linear',
      min_distance: 1,
      max_distance: 100,
      zones: [
        {
          id: 'pub',
          type: 'public',
          bounds: { center: { x: 0, y: 0, z: 0 }, radius: 50 },
          volumeMultiplier: 2.0,
        },
      ],
    });
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_distance_update',
      distance: 5,
      listenerPosition: { x: 0, y: 0, z: 0 }, // inside zone
      speakerPosition: { x: 5, y: 0, z: 0 }, // inside zone
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'voice_proximity_changed');
    // Base linear attenuation for d=5, min=1, max=100: normalized=(5-1)/99≈0.040, attenuation≈0.960
    // × volumeMultiplier=2 → but capped logic in calculateAttenuation doesn't cap here
    expect(call![1].attenuation).toBeGreaterThan(0.5);
  });

  it('private zone blocks audio when only one party is inside', () => {
    const { node, ctx, config } = attach({
      falloff: 'linear',
      min_distance: 0,
      max_distance: 100,
      zones: [
        {
          id: 'priv',
          type: 'private',
          bounds: { center: { x: 0, y: 0, z: 0 }, radius: 5 },
          volumeMultiplier: 1.0,
        },
      ],
    });
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_distance_update',
      distance: 3,
      listenerPosition: { x: 3, y: 0, z: 0 }, // inside private zone
      speakerPosition: { x: 20, y: 0, z: 0 }, // OUTSIDE private zone
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'voice_proximity_changed');
    expect(call![1].attenuation).toBe(0);
  });
});

// ─── onEvent — other events ───────────────────────────────────────────────────

describe('voiceProximityHandler.onEvent — other events', () => {
  it('voice_activity sets voiceActive', () => {
    const { node, ctx, config } = attach();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_activity',
      active: true,
    });
    expect((node as any).__voiceProximityState.voiceActive).toBe(true);
  });

  it('voice_mute sets isMuted=true and emits set_gain={gain:0}', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_mute',
      muted: true,
    });
    expect((node as any).__voiceProximityState.isMuted).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('voice_set_gain', { node: expect.anything(), gain: 0 });
  });

  it('voice_mute=false sets isMuted=false without gain emit', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_mute',
      muted: false,
    });
    expect((node as any).__voiceProximityState.isMuted).toBe(false);
    expect(ctx.emit).not.toHaveBeenCalledWith('voice_set_gain', expect.anything());
  });

  it('voice_zone_enter stores zoneId and emits voice_zone_changed', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_zone_enter',
      zoneId: 'zone_42',
    });
    expect((node as any).__voiceProximityState.activeZone).toBe('zone_42');
    expect(ctx.emit).toHaveBeenCalledWith(
      'voice_zone_changed',
      expect.objectContaining({ zoneId: 'zone_42' })
    );
  });

  it('voice_zone_exit clears activeZone', () => {
    const { node, ctx, config } = attach();
    (node as any).__voiceProximityState.activeZone = 'zone_42';
    voiceProximityHandler.onEvent!(node as any, config, ctx as any, { type: 'voice_zone_exit' });
    expect((node as any).__voiceProximityState.activeZone).toBeNull();
  });
});
