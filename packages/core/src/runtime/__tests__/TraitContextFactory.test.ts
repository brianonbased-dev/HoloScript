import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TraitContextFactory,
  createTraitContextFactory,
  type PhysicsProvider,
  type AudioProvider,
  type HapticsProvider,
  type AccessibilityProvider,
  type VRProvider,
  type NetworkProvider,
  type RendererProvider,
} from '../TraitContextFactory';

// =============================================================================
// Helpers
// =============================================================================

function makeMockPhysics(): PhysicsProvider {
  return {
    applyVelocity: vi.fn(),
    applyAngularVelocity: vi.fn(),
    setKinematic: vi.fn(),
    raycast: vi
      .fn()
      .mockReturnValue({
        point: { x: 1, y: 2, z: 3 },
        normal: { x: 0, y: 1, z: 0 },
        distance: 5,
        nodeId: 'hit-1',
      }),
  };
}

function makeMockAudio(): AudioProvider {
  return {
    playSound: vi.fn(),
    updateSpatialSource: vi.fn(),
    registerAmbisonicSource: vi.fn(),
    setAudioPortal: vi.fn(),
    updateAudioMaterial: vi.fn(),
  };
}

function makeMockHaptics(): HapticsProvider {
  return {
    pulse: vi.fn(),
    rumble: vi.fn(),
  };
}

function makeMockAccessibility(): AccessibilityProvider {
  return {
    announce: vi.fn(),
    setScreenReaderFocus: vi.fn(),
    setAltText: vi.fn(),
    setHighContrast: vi.fn(),
  };
}

function makeMockVR(): VRProvider {
  return {
    getLeftHand: vi
      .fn()
      .mockReturnValue({
        id: 'left',
        position: { x: -0.3, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        grip: 0,
        trigger: 0,
      }),
    getRightHand: vi
      .fn()
      .mockReturnValue({
        id: 'right',
        position: { x: 0.3, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        grip: 0,
        trigger: 0,
      }),
    getHeadsetPosition: vi.fn().mockReturnValue({ x: 0, y: 1.6, z: 0 }),
    getHeadsetRotation: vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
    getPointerRay: vi
      .fn()
      .mockReturnValue({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 } }),
    getDominantHand: vi.fn().mockReturnValue(null),
  };
}

function makeMockNetwork(): NetworkProvider {
  return {
    broadcastState: vi.fn(),
    requestAuthority: vi.fn().mockReturnValue(true),
    onRemoteUpdate: vi.fn(),
  };
}

function makeMockRenderer(): RendererProvider {
  return {
    createGaussianSplat: vi.fn(),
    createPointCloud: vi.fn(),
    dispatchCompute: vi.fn(),
    destroyRenderable: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('TraitContextFactory', () => {
  // ---- Factory creation ---------------------------------------------------

  describe('factory creation', () => {
    it('creates a factory with no config (uses no-op fallbacks)', () => {
      const factory = new TraitContextFactory();
      expect(factory).toBeInstanceOf(TraitContextFactory);
    });

    it('creates a factory via createTraitContextFactory helper', () => {
      const factory = createTraitContextFactory();
      expect(factory).toBeInstanceOf(TraitContextFactory);
    });

    it('creates a factory with partial config', () => {
      const physics = makeMockPhysics();
      const factory = createTraitContextFactory({ physics });
      const ctx = factory.createContext();
      // Physics should route to mock, others to no-ops
      ctx.physics.applyVelocity({ type: 'node', id: 'n1' } as any, { x: 1, y: 0, z: 0 });
      expect(physics.applyVelocity).toHaveBeenCalledWith('n1', { x: 1, y: 0, z: 0 });
    });

    it('creates a factory with full config', () => {
      const factory = createTraitContextFactory({
        physics: makeMockPhysics(),
        audio: makeMockAudio(),
        haptics: makeMockHaptics(),
        accessibility: makeMockAccessibility(),
        vr: makeMockVR(),
        network: makeMockNetwork(),
        renderer: makeMockRenderer(),
      });
      expect(factory).toBeInstanceOf(TraitContextFactory);
    });
  });

  // ---- No-op fallbacks ----------------------------------------------------

  describe('no-op fallbacks', () => {
    let factory: TraitContextFactory;

    beforeEach(() => {
      factory = new TraitContextFactory();
    });

    it('no-op physics does not throw', () => {
      const ctx = factory.createContext();
      const node = { type: 'node', id: 'test' } as any;
      expect(() => ctx.physics.applyVelocity(node, { x: 1, y: 0, z: 0 })).not.toThrow();
      expect(() => ctx.physics.applyAngularVelocity(node, { x: 0, y: 1, z: 0 })).not.toThrow();
      expect(() => ctx.physics.setKinematic(node, true)).not.toThrow();
    });

    it('no-op physics raycast returns null', () => {
      const ctx = factory.createContext();
      const result = ctx.physics.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 100);
      expect(result).toBeNull();
    });

    it('no-op audio does not throw', () => {
      const ctx = factory.createContext();
      expect(() => ctx.audio.playSound('explosion.wav', { volume: 0.5 })).not.toThrow();
    });

    it('no-op haptics does not throw', () => {
      const ctx = factory.createContext();
      expect(() => ctx.haptics.pulse('left', 0.5, 100)).not.toThrow();
      expect(() => ctx.haptics.rumble('right', 0.3)).not.toThrow();
    });

    it('no-op VR hands return null', () => {
      const ctx = factory.createContext();
      expect(ctx.vr.hands.left).toBeNull();
      expect(ctx.vr.hands.right).toBeNull();
      expect(ctx.vr.getDominantHand()).toBeNull();
    });

    it('no-op VR headset returns default position', () => {
      const ctx = factory.createContext();
      // Default headset height ~1.6m
      const pos = ctx.vr.headset.position;
      expect(pos).toBeDefined();
    });

    it('no-op VR pointer ray returns null', () => {
      const ctx = factory.createContext();
      expect(ctx.vr.getPointerRay('left')).toBeNull();
      expect(ctx.vr.getPointerRay('right')).toBeNull();
    });

    it('accessibility is undefined when no provider given', () => {
      const ctx = factory.createContext();
      expect(ctx.accessibility).toBeUndefined();
    });
  });

  // ---- Provider delegation ------------------------------------------------

  describe('provider delegation', () => {
    it('physics context delegates to provider', () => {
      const physics = makeMockPhysics();
      const factory = createTraitContextFactory({ physics });
      const ctx = factory.createContext();
      const node = { type: 'node', id: 'ball' } as any;
      const velocity = { x: 5, y: 10, z: 0 };

      ctx.physics.applyVelocity(node, velocity);
      expect(physics.applyVelocity).toHaveBeenCalledWith('ball', velocity);

      ctx.physics.applyAngularVelocity(node, { x: 0, y: 1, z: 0 });
      expect(physics.applyAngularVelocity).toHaveBeenCalledWith('ball', { x: 0, y: 1, z: 0 });

      ctx.physics.setKinematic(node, false);
      expect(physics.setKinematic).toHaveBeenCalledWith('ball', false);
    });

    it('physics raycast delegates to provider and returns result', () => {
      const physics = makeMockPhysics();
      const factory = createTraitContextFactory({ physics });
      const ctx = factory.createContext();

      const result = ctx.physics.raycast({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 50);
      expect(physics.raycast).toHaveBeenCalledWith({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 50);
      expect(result).toEqual({
        point: { x: 1, y: 2, z: 3 },
        normal: { x: 0, y: 1, z: 0 },
        distance: 5,
        nodeId: 'hit-1',
      });
    });

    it('audio context delegates to provider including optional methods', () => {
      const audio = makeMockAudio();
      const factory = createTraitContextFactory({ audio });
      const ctx = factory.createContext();

      ctx.audio.playSound('boom.wav', { volume: 0.8 });
      expect(audio.playSound).toHaveBeenCalledWith('boom.wav', { volume: 0.8 });

      ctx.audio.updateSpatialSource('src-1', { hrtfProfile: 'default' });
      expect(audio.updateSpatialSource).toHaveBeenCalledWith('src-1', { hrtfProfile: 'default' });

      ctx.audio.registerAmbisonicSource('amb-1', 3);
      expect(audio.registerAmbisonicSource).toHaveBeenCalledWith('amb-1', 3);

      ctx.audio.setAudioPortal('portal-1', 'zone-a', 2.5);
      expect(audio.setAudioPortal).toHaveBeenCalledWith('portal-1', 'zone-a', 2.5);

      ctx.audio.updateAudioMaterial('wall-1', 0.7, 0.3);
      expect(audio.updateAudioMaterial).toHaveBeenCalledWith('wall-1', 0.7, 0.3);
    });

    it('haptics context delegates to provider', () => {
      const haptics = makeMockHaptics();
      const factory = createTraitContextFactory({ haptics });
      const ctx = factory.createContext();

      ctx.haptics.pulse('left', 0.5, 200);
      expect(haptics.pulse).toHaveBeenCalledWith('left', 0.5, 200);

      ctx.haptics.rumble('right', 0.8);
      expect(haptics.rumble).toHaveBeenCalledWith('right', 0.8);
    });

    it('VR context delegates to provider', () => {
      const vr = makeMockVR();
      const factory = createTraitContextFactory({ vr });
      const ctx = factory.createContext();

      expect(ctx.vr.hands.left).toEqual(expect.objectContaining({ id: 'left' }));
      expect(vr.getLeftHand).toHaveBeenCalled();

      expect(ctx.vr.hands.right).toEqual(expect.objectContaining({ id: 'right' }));
      expect(vr.getRightHand).toHaveBeenCalled();

      ctx.vr.getPointerRay('left');
      expect(vr.getPointerRay).toHaveBeenCalledWith('left');

      ctx.vr.getDominantHand();
      expect(vr.getDominantHand).toHaveBeenCalled();
    });

    it('accessibility context delegates when provider is given', () => {
      const accessibility = makeMockAccessibility();
      const factory = createTraitContextFactory({ accessibility });
      const ctx = factory.createContext();

      expect(ctx.accessibility).toBeDefined();
      ctx.accessibility!.announce('Hello');
      expect(accessibility.announce).toHaveBeenCalledWith('Hello');

      ctx.accessibility!.setScreenReaderFocus('btn-1');
      expect(accessibility.setScreenReaderFocus).toHaveBeenCalledWith('btn-1');

      ctx.accessibility!.setAltText('img-1', 'A cat');
      expect(accessibility.setAltText).toHaveBeenCalledWith('img-1', 'A cat');

      ctx.accessibility!.setHighContrast(true);
      expect(accessibility.setHighContrast).toHaveBeenCalledWith(true);
    });
  });

  // ---- Provider hot-swap --------------------------------------------------

  describe('provider hot-swap', () => {
    it('hot-swaps physics provider and new context uses it', () => {
      const factory = new TraitContextFactory();
      const newPhysics = makeMockPhysics();
      factory.setPhysicsProvider(newPhysics);

      const ctx = factory.createContext();
      const node = { type: 'node', id: 'obj' } as any;
      ctx.physics.applyVelocity(node, { x: 1, y: 0, z: 0 });
      expect(newPhysics.applyVelocity).toHaveBeenCalled();
    });

    it('hot-swaps audio provider', () => {
      const factory = new TraitContextFactory();
      const newAudio = makeMockAudio();
      factory.setAudioProvider(newAudio);

      const ctx = factory.createContext();
      ctx.audio.playSound('test.wav');
      expect(newAudio.playSound).toHaveBeenCalledWith('test.wav', undefined);
    });

    it('hot-swaps haptics provider', () => {
      const factory = new TraitContextFactory();
      const newHaptics = makeMockHaptics();
      factory.setHapticsProvider(newHaptics);

      const ctx = factory.createContext();
      ctx.haptics.pulse('left', 1.0);
      expect(newHaptics.pulse).toHaveBeenCalled();
    });

    it('hot-swaps VR provider', () => {
      const factory = new TraitContextFactory();
      const newVR = makeMockVR();
      factory.setVRProvider(newVR);

      const ctx = factory.createContext();
      ctx.vr.hands.left;
      expect(newVR.getLeftHand).toHaveBeenCalled();
    });

    it('hot-swaps accessibility provider (from undefined)', () => {
      const factory = new TraitContextFactory();
      expect(factory.createContext().accessibility).toBeUndefined();

      factory.setAccessibilityProvider(makeMockAccessibility());
      const ctx = factory.createContext();
      expect(ctx.accessibility).toBeDefined();
    });

    it('sets network provider and retrieves it', () => {
      const factory = new TraitContextFactory();
      expect(factory.getNetworkProvider()).toBeUndefined();

      const network = makeMockNetwork();
      factory.setNetworkProvider(network);
      expect(factory.getNetworkProvider()).toBe(network);
    });

    it('sets renderer provider and retrieves it', () => {
      const factory = new TraitContextFactory();
      expect(factory.getRendererProvider()).toBeUndefined();

      const renderer = makeMockRenderer();
      factory.setRendererProvider(renderer);
      expect(factory.getRendererProvider()).toBe(renderer);
    });
  });

  // ---- Event bus ----------------------------------------------------------

  describe('event bus', () => {
    it('emits events through the context', () => {
      const factory = new TraitContextFactory();
      const handler = vi.fn();
      factory.on('explosion', handler);

      const ctx = factory.createContext();
      ctx.emit('explosion', { radius: 5 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ radius: 5 });
    });

    it('supports multiple handlers for same event', () => {
      const factory = new TraitContextFactory();
      const h1 = vi.fn();
      const h2 = vi.fn();
      factory.on('tick', h1);
      factory.on('tick', h2);

      const ctx = factory.createContext();
      ctx.emit('tick', 0.016);

      expect(h1).toHaveBeenCalledWith(0.016);
      expect(h2).toHaveBeenCalledWith(0.016);
    });

    it('off removes a specific handler', () => {
      const factory = new TraitContextFactory();
      const handler = vi.fn();
      factory.on('test', handler);
      factory.off('test', handler);

      const ctx = factory.createContext();
      ctx.emit('test', 'data');

      expect(handler).not.toHaveBeenCalled();
    });

    it('off with unknown handler is harmless', () => {
      const factory = new TraitContextFactory();
      expect(() => factory.off('no-event', vi.fn())).not.toThrow();
    });

    it('off with unknown event name is harmless', () => {
      const factory = new TraitContextFactory();
      factory.on('real', vi.fn());
      expect(() => factory.off('fake', vi.fn())).not.toThrow();
    });

    it('emit with no listeners is harmless', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();
      expect(() => ctx.emit('nobody-listens')).not.toThrow();
    });
  });

  // ---- State management ---------------------------------------------------

  describe('state management', () => {
    it('getState returns empty object initially', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();
      expect(ctx.getState()).toEqual({});
    });

    it('setState merges updates', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();

      ctx.setState({ score: 10 });
      expect(ctx.getState()).toEqual({ score: 10 });

      ctx.setState({ health: 100 });
      expect(ctx.getState()).toEqual({ score: 10, health: 100 });
    });

    it('setState overwrites existing keys', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();

      ctx.setState({ score: 10 });
      ctx.setState({ score: 20 });
      expect(ctx.getState()).toEqual({ score: 20 });
    });

    it('getState returns a copy (not the internal reference)', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();
      ctx.setState({ key: 'value' });

      const state = ctx.getState();
      state.key = 'mutated';
      expect(ctx.getState().key).toBe('value');
    });
  });

  // ---- Scale context ------------------------------------------------------

  describe('scale context', () => {
    it('returns 1 for "normal" scale', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();
      expect(ctx.getScaleMultiplier()).toBe(1);
    });

    it('returns correct multiplier for known magnitudes', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();

      const expected: Record<string, number> = {
        nano: 0.000001,
        micro: 0.001,
        milli: 0.01,
        centi: 0.1,
        normal: 1,
        deka: 10,
        hecto: 100,
        kilo: 1000,
        mega: 1000000,
      };

      for (const [magnitude, multiplier] of Object.entries(expected)) {
        ctx.setScaleContext(magnitude);
        expect(ctx.getScaleMultiplier()).toBe(multiplier);
      }
    });

    it('returns 1 for unknown magnitude', () => {
      const factory = new TraitContextFactory();
      const ctx = factory.createContext();
      ctx.setScaleContext('unknown-scale');
      expect(ctx.getScaleMultiplier()).toBe(1);
    });
  });

  // ---- Node ID fallback for missing id ------------------------------------

  describe('node id fallback', () => {
    it('uses empty string when node.id is undefined', () => {
      const physics = makeMockPhysics();
      const factory = createTraitContextFactory({ physics });
      const ctx = factory.createContext();
      const node = { type: 'node' } as any; // no id

      ctx.physics.applyVelocity(node, { x: 1, y: 0, z: 0 });
      expect(physics.applyVelocity).toHaveBeenCalledWith('', { x: 1, y: 0, z: 0 });
    });
  });

  // ---- dispose ------------------------------------------------------------

  describe('dispose', () => {
    it('clears event listeners and state', () => {
      const factory = new TraitContextFactory();
      const handler = vi.fn();
      factory.on('test', handler);

      const ctx = factory.createContext();
      ctx.setState({ key: 'value' });

      factory.dispose();

      // After dispose, events should no longer fire
      ctx.emit('test', 'data');
      expect(handler).not.toHaveBeenCalled();

      // State is cleared
      expect(ctx.getState()).toEqual({});
    });
  });
});
