/**
 * SpatialAudioTraits — unit tests for Tier-4 spatial audio handlers.
 *
 * AudioContext and Web Audio nodes are stubbed via vitest.fn() — no browser
 * environment needed.  THREE.Object3D is real (no WebGL dependency).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  PositionalTrait,
  AmbisonicsTrait,
  HRTFTrait,
  AudioOcclusionTrait,
  AudioPortalTrait,
  SpatialVoiceTrait,
  HeadTrackedAudioTrait,
} from '../SpatialAudioTraits';
import type { TraitContext } from '../TraitSystem';

// ──────────────────────────────────────────────────────────────────
// Helpers / stubs
// ──────────────────────────────────────────────────────────────────

function stubPhysicsWorld(): TraitContext['physicsWorld'] {
  return { addBody: vi.fn() } as unknown as TraitContext['physicsWorld'];
}

function makeContext(object: THREE.Object3D, config: Record<string, unknown> = {}): TraitContext {
  return {
    object,
    physicsWorld: stubPhysicsWorld(),
    config,
    data: {},
  };
}

// Minimal Audio node stub factory
function stubNode(extraMethods: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extraMethods,
  };
}

// Stub AudioParam (setValueAtTime / setTargetAtTime)
function stubParam(value = 0): Record<string, unknown> {
  return {
    value,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

// Minimal AudioContext stub
function makeAudioContextStub() {
  const destination = stubNode();
  const listenerStub = {
    positionX: stubParam(),
    positionY: stubParam(),
    positionZ: stubParam(),
    forwardX: stubParam(),
    forwardY: stubParam(),
    forwardZ: stubParam(),
    upX: stubParam(),
    upY: stubParam(),
    upZ: stubParam(),
  };
  const pannerStub = {
    ...stubNode(),
    panningModel: 'equalpower' as PanningModelType,
    distanceModel: 'inverse' as DistanceModelType,
    refDistance: 1,
    maxDistance: 10000,
    rolloffFactor: 1,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
    positionX: stubParam(),
    positionY: stubParam(),
    positionZ: stubParam(),
  };
  const gainStub = {
    ...stubNode(),
    gain: stubParam(1),
  };
  const filterStub = {
    ...stubNode(),
    type: 'lowpass' as BiquadFilterType,
    frequency: stubParam(20000),
  };
  const splitterStub = {
    ...stubNode(),
  };
  const bufferSourceStub = {
    ...stubNode(),
    buffer: null as AudioBuffer | null,
    loop: false,
    start: vi.fn(),
    stop: vi.fn(),
  };

  const ctx = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    destination,
    listener: listenerStub,
    resume: vi.fn().mockResolvedValue(undefined),
    createPanner: vi.fn().mockReturnValue(pannerStub),
    createGain: vi.fn().mockReturnValue(gainStub),
    createBiquadFilter: vi.fn().mockReturnValue(filterStub),
    createChannelSplitter: vi.fn().mockReturnValue(splitterStub),
    createBufferSource: vi.fn().mockReturnValue(bufferSourceStub),
    decodeAudioData: vi.fn().mockResolvedValue({
      numberOfChannels: 4,
      length: 1024,
      duration: 1,
    } as unknown as AudioBuffer),
    _pannerStub: pannerStub,
    _gainStub: gainStub,
    _filterStub: filterStub,
    _splitterStub: splitterStub,
    _bufferSourceStub: bufferSourceStub,
  };

  return ctx;
}

// Inject the audio context stub into window before each relevant test
function injectAudioContext(ctx: ReturnType<typeof makeAudioContextStub>) {
  const win = globalThis as unknown as {
    _holoAudioCtx?: unknown;
    AudioContext?: unknown;
  };
  win._holoAudioCtx = ctx;
  // Expose AudioContext constructor so getAudioContext() doesn't bail out
  if (!win.AudioContext) {
    win.AudioContext = class {};
  }
}

function clearAudioContext() {
  const win = globalThis as unknown as { _holoAudioCtx?: unknown };
  delete win._holoAudioCtx;
}

// ──────────────────────────────────────────────────────────────────
// PositionalTrait
// ──────────────────────────────────────────────────────────────────

describe('PositionalTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores config defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    PositionalTrait.onApply!(ctx);
    expect(ctx.data.volume).toBe(1.0);
    expect(ctx.data.refDistance).toBe(1);
    expect(ctx.data.maxDistance).toBe(100);
    expect(ctx.data.rolloff).toBe('inverse');
    expect(ctx.data.loop).toBe(true);
    expect(ctx.data.autoplay).toBe(false);
    expect(obj.userData.positionalAudio).toBe(true);
  });

  it('onApply respects explicit config values', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {
      volume: 0.5,
      ref_distance: 2,
      max_distance: 50,
      rolloff: 'linear',
      loop: false,
      autoplay: true,
    });
    PositionalTrait.onApply!(ctx);
    expect(ctx.data.volume).toBe(0.5);
    expect(ctx.data.refDistance).toBe(2);
    expect(ctx.data.maxDistance).toBe(50);
    expect(ctx.data.rolloff).toBe('linear');
    expect(ctx.data.loop).toBe(false);
    expect(ctx.data.autoplay).toBe(true);
  });

  it('onUpdate syncs panner position when audioCtx present', () => {
    const audioCtxStub = makeAudioContextStub();
    injectAudioContext(audioCtxStub);
    const obj = new THREE.Object3D();
    obj.position.set(3, 1, -2);
    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.panner = audioCtxStub._pannerStub;
    PositionalTrait.onUpdate!(ctx, 0.016);
    expect(
      (audioCtxStub._pannerStub.positionX as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(3, 0);
    expect(
      (audioCtxStub._pannerStub.positionY as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(1, 0);
    expect(
      (audioCtxStub._pannerStub.positionZ as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(-2, 0);
  });

  it('onRemove clears userData flags', () => {
    const obj = new THREE.Object3D();
    obj.userData.positionalAudio = true;
    obj.userData.positionalPlaying = true;
    const ctx = makeContext(obj, {});
    ctx.data.source = null;
    ctx.data.panner = null;
    ctx.data.gainNode = null;
    PositionalTrait.onRemove!(ctx);
    expect(obj.userData.positionalAudio).toBe(false);
    expect(obj.userData.positionalPlaying).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// AmbisonicsTrait
// ──────────────────────────────────────────────────────────────────

describe('AmbisonicsTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores FoA defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    AmbisonicsTrait.onApply!(ctx);
    expect(ctx.data.order).toBe(1);
    expect(ctx.data.volume).toBe(1.0);
    expect(ctx.data.loop).toBe(true);
    expect(obj.userData.ambisonics).toBe(true);
    expect(obj.userData.ambisonicsOrder).toBe(1);
  });

  it('onApply respects custom order and volume', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { order: 3, volume: 0.7 });
    AmbisonicsTrait.onApply!(ctx);
    expect(ctx.data.order).toBe(3);
    expect(ctx.data.volume).toBe(0.7);
  });

  it('onRemove clears userData flags', () => {
    const obj = new THREE.Object3D();
    obj.userData.ambisonics = true;
    obj.userData.ambisonicsPlaying = true;
    const ctx = makeContext(obj, {});
    ctx.data.source = null;
    ctx.data.gainNode = null;
    AmbisonicsTrait.onRemove!(ctx);
    expect(obj.userData.ambisonics).toBe(false);
    expect(obj.userData.ambisonicsPlaying).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// HRTFTrait
// ──────────────────────────────────────────────────────────────────

describe('HRTFTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores HRTF defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    HRTFTrait.onApply!(ctx);
    expect(ctx.data.refDistance).toBe(1);
    expect(ctx.data.maxDistance).toBe(100);
    expect(obj.userData.hrtfEnabled).toBe(true);
  });

  it('onUpdate syncs panner and listener when audioCtx present', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    obj.position.set(1, 2, 3);
    const scene = new THREE.Scene();
    scene.add(obj);
    const cam = new THREE.PerspectiveCamera();
    scene.add(cam);

    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.panner = audioCtxStub._pannerStub;

    HRTFTrait.onUpdate!(ctx, 0.016);
    expect(
      (audioCtxStub._pannerStub.positionX as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(1, 0);
    // Listener orientation params should have been touched
    expect(
      (audioCtxStub.listener.forwardX as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalled();
  });

  it('onRemove clears userData flags', () => {
    const obj = new THREE.Object3D();
    obj.userData.hrtfEnabled = true;
    obj.userData.hrtfPlaying = true;
    const ctx = makeContext(obj, {});
    ctx.data.source = null;
    ctx.data.panner = null;
    ctx.data.gainNode = null;
    HRTFTrait.onRemove!(ctx);
    expect(obj.userData.hrtfEnabled).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// AudioOcclusionTrait
// ──────────────────────────────────────────────────────────────────

describe('AudioOcclusionTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    AudioOcclusionTrait.onApply!(ctx);
    expect(ctx.data.occlusionFactor).toBe(0);
    expect(ctx.data.maxAttenuation).toBe(-24);
    expect(ctx.data.cutoffMin).toBe(400);
    expect(ctx.data.cutoffMax).toBe(20000);
    expect(obj.userData.audioOcclusion).toBe(true);
    expect(obj.userData.occlusionFactor).toBe(0);
  });

  it('onUpdate applies gain and filter based on occlusion factor', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {
      max_attenuation: -24,
      cutoff_min: 400,
      cutoff_max: 20000,
      update_interval: 0,
    });
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.gainNode = audioCtxStub._gainStub;
    ctx.data.filterNode = audioCtxStub._filterStub;
    ctx.data.maxAttenuation = -24;
    ctx.data.cutoffMin = 400;
    ctx.data.cutoffMax = 20000;
    ctx.data.updateInterval = 0;
    ctx.data.timeSinceUpdate = 1;
    // Fully occluded
    ctx.data.occlusionFactor = 1;
    AudioOcclusionTrait.onUpdate!(ctx, 0.016);
    // Gain should be attenuated (not 1)
    expect(
      (audioCtxStub._gainStub.gain as Record<string, unknown>).setTargetAtTime
    ).toHaveBeenCalled();
    // Filter cutoff should be the minimum
    const filterCalls = (audioCtxStub._filterStub.frequency as Record<string, unknown>)
      .setTargetAtTime as ReturnType<typeof vi.fn>;
    expect(filterCalls).toHaveBeenCalled();
    const [cutoffValue] = filterCalls.mock.calls[0] as [number, ...unknown[]];
    expect(cutoffValue).toBeCloseTo(400);
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    obj.userData.audioOcclusion = true;
    const ctx = makeContext(obj, {});
    ctx.data.filterNode = null;
    ctx.data.gainNode = null;
    AudioOcclusionTrait.onRemove!(ctx);
    expect(obj.userData.audioOcclusion).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// AudioPortalTrait
// ──────────────────────────────────────────────────────────────────

describe('AudioPortalTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { partner_id: 'portal-b', blend_distance: 5 });
    AudioPortalTrait.onApply!(ctx);
    expect(ctx.data.partnerId).toBe('portal-b');
    expect(ctx.data.blendDistance).toBe(5);
    expect(ctx.data.gain).toBe(0.8);
    expect(obj.userData.audioPortal).toBe(true);
    expect(obj.userData.partnerId).toBe('portal-b');
    expect(obj.userData.portalBlend).toBe(0);
  });

  it('onUpdate opens portal when listener is close', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    const scene = new THREE.Scene();
    scene.add(obj);
    // Camera at origin → distance 0 → portal fully open
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 0, 0);
    scene.add(cam);

    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.portalGain = audioCtxStub._gainStub;
    ctx.data.blendDistance = 3;
    ctx.data.maxDistance = 0.5;
    ctx.data.gain = 0.8;
    AudioPortalTrait.onUpdate!(ctx, 0.016);
    expect(obj.userData.portalBlend).toBeGreaterThan(0);
    expect(
      (audioCtxStub._gainStub.gain as Record<string, unknown>).setTargetAtTime
    ).toHaveBeenCalled();
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    obj.userData.audioPortal = true;
    obj.userData.portalBlend = 0.5;
    const ctx = makeContext(obj, {});
    ctx.data.portalGain = null;
    AudioPortalTrait.onRemove!(ctx);
    expect(obj.userData.audioPortal).toBe(false);
    expect(obj.userData.portalBlend).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// SpatialVoiceTrait
// ──────────────────────────────────────────────────────────────────

describe('SpatialVoiceTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores voice defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { peer_id: 'player-42', near_distance: 3 });
    SpatialVoiceTrait.onApply!(ctx);
    expect(ctx.data.peerId).toBe('player-42');
    expect(ctx.data.nearDistance).toBe(3);
    expect(ctx.data.farDistance).toBe(20);
    expect(ctx.data.muted).toBe(false);
    expect(obj.userData.spatialVoice).toBe(true);
    expect(obj.userData.voicePeerId).toBe('player-42');
    expect(obj.userData.voiceMuted).toBe(false);
  });

  it('onApply respects muted flag', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { muted: true });
    SpatialVoiceTrait.onApply!(ctx);
    expect(ctx.data.muted).toBe(true);
    expect(obj.userData.voiceMuted).toBe(true);
  });

  it('onUpdate adjusts gain by distance', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 10); // far from origin listener
    const scene = new THREE.Scene();
    scene.add(obj);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 0, 0);
    scene.add(cam);

    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.panner = audioCtxStub._pannerStub;
    ctx.data.gainNode = audioCtxStub._gainStub;
    ctx.data.muted = false;
    ctx.data.nearDistance = 2;
    ctx.data.farDistance = 20;
    ctx.data.minVolume = 0.05;
    ctx.data.maxVolume = 1.0;

    SpatialVoiceTrait.onUpdate!(ctx, 0.016);
    expect(
      (audioCtxStub._gainStub.gain as Record<string, unknown>).setTargetAtTime
    ).toHaveBeenCalled();
    // At distance 10, gain should be partially attenuated
    expect(ctx.data.currentGain as number).toBeLessThan(1.0);
    expect(ctx.data.currentGain as number).toBeGreaterThan(0);
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    obj.userData.spatialVoice = true;
    const ctx = makeContext(obj, {});
    ctx.data.streamSource = null;
    ctx.data.panner = null;
    ctx.data.gainNode = null;
    SpatialVoiceTrait.onRemove!(ctx);
    expect(obj.userData.spatialVoice).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// HeadTrackedAudioTrait
// ──────────────────────────────────────────────────────────────────

describe('HeadTrackedAudioTrait', () => {
  beforeEach(() => clearAudioContext());

  it('onApply stores defaults and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    HeadTrackedAudioTrait.onApply!(ctx);
    expect(ctx.data.enabled).toBe(true);
    expect(ctx.data.updateRate).toBe(60);
    expect(ctx.data.xrSessionType).toBe('immersive-vr');
    expect(obj.userData.headTrackedAudio).toBe(true);
    expect(obj.userData.headTrackingEnabled).toBe(true);
  });

  it('onApply respects enabled=false', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { enabled: false, update_rate: 30 });
    HeadTrackedAudioTrait.onApply!(ctx);
    expect(ctx.data.enabled).toBe(false);
    expect(ctx.data.updateRate).toBe(30);
    expect(obj.userData.headTrackingEnabled).toBe(false);
  });

  it('onUpdate syncs listener position and orientation to object pose', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    obj.position.set(1, 1.7, 0); // typical head height

    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.enabled = true;
    ctx.data.updateRate = 60;
    ctx.data.timeSinceUpdate = 1; // force update

    HeadTrackedAudioTrait.onUpdate!(ctx, 0.016);

    expect(
      (audioCtxStub.listener.positionX as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(1, 0);
    expect(
      (audioCtxStub.listener.positionY as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(1.7, 0);
    expect(
      (audioCtxStub.listener.positionZ as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalledWith(0, 0);
    expect(
      (audioCtxStub.listener.forwardX as Record<string, unknown>).setValueAtTime
    ).toHaveBeenCalled();
    expect(obj.userData.listenerSynced).toBe(true);
  });

  it('onUpdate skips update when interval not elapsed', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.enabled = true;
    ctx.data.updateRate = 60;
    ctx.data.timeSinceUpdate = 0; // not elapsed yet

    HeadTrackedAudioTrait.onUpdate!(ctx, 0.001);
    // Should NOT have called any listener params
    expect(
      (audioCtxStub.listener.positionX as Record<string, unknown>).setValueAtTime
    ).not.toHaveBeenCalled();
  });

  it('onUpdate is no-op when disabled', () => {
    const audioCtxStub = makeAudioContextStub();
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, {});
    ctx.data.audioCtx = audioCtxStub;
    ctx.data.enabled = false;
    ctx.data.updateRate = 60;
    ctx.data.timeSinceUpdate = 1;

    HeadTrackedAudioTrait.onUpdate!(ctx, 0.016);
    expect(
      (audioCtxStub.listener.positionX as Record<string, unknown>).setValueAtTime
    ).not.toHaveBeenCalled();
  });

  it('onRemove clears userData flags', () => {
    const obj = new THREE.Object3D();
    obj.userData.headTrackedAudio = true;
    obj.userData.headTrackingEnabled = true;
    obj.userData.listenerSynced = true;
    const ctx = makeContext(obj, {});
    HeadTrackedAudioTrait.onRemove!(ctx);
    expect(obj.userData.headTrackedAudio).toBe(false);
    expect(obj.userData.headTrackingEnabled).toBe(false);
    expect(obj.userData.listenerSynced).toBe(false);
  });
});
