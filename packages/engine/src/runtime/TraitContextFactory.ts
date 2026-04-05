/**
 * TraitContextFactory
 *
 * Creates TraitContext objects backed by platform-provided APIs.
 * This is the dependency-injection layer that connects HoloScript's 121 trait
 * handlers to real platform services (audio, physics, haptics, accessibility, etc.)
 *
 * Without this factory, trait handlers receive no-op context and do nothing.
 * With it, every trait handler in @holoscript/core actually executes against
 * real platform services.
 *
 * Consuming platforms (e.g., Hololand, custom engines) implement the Provider
 * interfaces and pass them to createTraitContextFactory().
 *
 * @module TraitContextFactory
 */

import type {
  TraitContext,
  VRContext,
  PhysicsContext,
  AudioContext as TraitAudioContext,
  HapticsContext,
  AccessibilityContext,
  RaycastHit,
} from '@holoscript/core';
import type {
  VRHand,
  Vector3,
  HSPlusNode,
} from '@holoscript/core';

// =============================================================================
// Provider Interfaces — each platform package implements one of these
// =============================================================================

/** Implemented by platform physics engine */
export interface PhysicsProvider {
  applyVelocity(nodeId: string, velocity: Vector3): void;
  applyAngularVelocity(nodeId: string, angularVelocity: Vector3): void;
  setKinematic(nodeId: string, kinematic: boolean): void;
  raycast(
    origin: Vector3,
    direction: Vector3,
    maxDistance: number
  ): { point: Vector3; normal: Vector3; distance: number; nodeId: string } | null;
  getBodyPosition?(nodeId: string): Vector3 | null;
  getBodyVelocity?(nodeId: string): Vector3 | null;
}

/** Implemented by platform spatial audio engine */
export interface AudioProvider {
  playSound(
    source: string,
    options?: { position?: Vector3; volume?: number; spatial?: boolean }
  ): void;
  updateSpatialSource?(
    nodeId: string,
    options: { hrtfProfile?: string; occlusion?: number; reverbWet?: number }
  ): void;
  registerAmbisonicSource?(nodeId: string, order: number): void;
  setAudioPortal?(portalId: string, targetZone: string, openingSize: number): void;
  updateAudioMaterial?(nodeId: string, absorption: number, reflection: number): void;
}

/** Implemented by platform haptic engine */
export interface HapticsProvider {
  pulse(hand: 'left' | 'right', intensity: number, duration?: number): void;
  rumble(hand: 'left' | 'right', intensity: number): void;
}

/** Implemented by platform accessibility manager */
export interface AccessibilityProvider {
  announce(text: string): void;
  setScreenReaderFocus(nodeId: string): void;
  setAltText(nodeId: string, text: string): void;
  setHighContrast(enabled: boolean): void;
}

/** Implemented by WebXR session or platform gesture system */
export interface VRProvider {
  getLeftHand(): VRHand | null;
  getRightHand(): VRHand | null;
  getHeadsetPosition(): Vector3;
  getHeadsetRotation(): Vector3;
  getPointerRay(hand: 'left' | 'right'): { origin: Vector3; direction: Vector3 } | null;
  getDominantHand(): VRHand | null;
}

/** Implemented by platform network layer for networked traits */
export interface NetworkProvider {
  broadcastState(nodeId: string, state: Record<string, unknown>): void;
  requestAuthority(nodeId: string): boolean;
  onRemoteUpdate(nodeId: string, callback: (state: Record<string, unknown>) => void): void;
}

/** Implemented by platform renderer for volumetric/GPU traits */
export interface RendererProvider {
  createGaussianSplat(nodeId: string, config: Record<string, unknown>): void;
  createPointCloud(nodeId: string, config: Record<string, unknown>): void;
  dispatchCompute(nodeId: string, shader: string, workgroups: number[]): void;
  destroyRenderable(nodeId: string): void;
}

// =============================================================================
// Factory Configuration
// =============================================================================

export interface TraitContextFactoryConfig {
  physics?: PhysicsProvider;
  audio?: AudioProvider;
  haptics?: HapticsProvider;
  accessibility?: AccessibilityProvider;
  vr?: VRProvider;
  network?: NetworkProvider;
  renderer?: RendererProvider;
}

// =============================================================================
// Scale Multipliers
// =============================================================================

const SCALE_MULTIPLIERS: Record<string, number> = {
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

// =============================================================================
// No-op Fallbacks
// =============================================================================

const NOOP_PHYSICS: PhysicsProvider = {
  applyVelocity() {},
  applyAngularVelocity() {},
  setKinematic() {},
  raycast() {
    return null;
  },
};

const NOOP_AUDIO: AudioProvider = {
  playSound() {},
};

const NOOP_HAPTICS: HapticsProvider = {
  pulse() {},
  rumble() {},
};

const NOOP_VR: VRProvider = {
  getLeftHand() {
    return null;
  },
  getRightHand() {
    return null;
  },
  getHeadsetPosition() {
    return [0, 1.6, 0] as unknown as Vector3;
  },
  getHeadsetRotation() {
    return [0, 0, 0] as unknown as Vector3;
  },
  getPointerRay() {
    return null;
  },
  getDominantHand() {
    return null;
  },
};

// =============================================================================
// TraitContextFactory
// =============================================================================

export class TraitContextFactory {
  private physicsProvider: PhysicsProvider;
  private audioProvider: AudioProvider;
  private hapticsProvider: HapticsProvider;
  private accessibilityProvider: AccessibilityProvider | undefined;
  private vrProvider: VRProvider;
  private networkProvider: NetworkProvider | undefined;
  private rendererProvider: RendererProvider | undefined;
  private scaleMagnitude: string = 'normal';
  private globalState: Record<string, unknown> = {};
  private eventListeners: Map<string, Array<(payload: unknown) => void>> = new Map();

  constructor(config: TraitContextFactoryConfig = {}) {
    this.physicsProvider = config.physics ?? NOOP_PHYSICS;
    this.audioProvider = config.audio ?? NOOP_AUDIO;
    this.hapticsProvider = config.haptics ?? NOOP_HAPTICS;
    this.accessibilityProvider = config.accessibility;
    this.vrProvider = config.vr ?? NOOP_VR;
    this.networkProvider = config.network;
    this.rendererProvider = config.renderer;
  }

  // ---- Provider hot-swap (packages load asynchronously) -------------------

  setPhysicsProvider(provider: PhysicsProvider): void {
    this.physicsProvider = provider;
  }
  setAudioProvider(provider: AudioProvider): void {
    this.audioProvider = provider;
  }
  setHapticsProvider(provider: HapticsProvider): void {
    this.hapticsProvider = provider;
  }
  setAccessibilityProvider(provider: AccessibilityProvider): void {
    this.accessibilityProvider = provider;
  }
  setVRProvider(provider: VRProvider): void {
    this.vrProvider = provider;
  }
  setNetworkProvider(provider: NetworkProvider): void {
    this.networkProvider = provider;
  }
  setRendererProvider(provider: RendererProvider): void {
    this.rendererProvider = provider;
  }

  // ---- Event bus ---------------------------------------------------------

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }

  off(event: string, handler: (payload: unknown) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  private emit(event: string, payload?: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        fn(payload);
      }
    }
  }

  // ---- Create TraitContext -----------------------------------------------

  /**
   * Build a TraitContext backed by real providers.
   * Pass this to VRTraitRegistry.attachTrait / updateTrait / handleEvent.
   */
  createContext(): TraitContext {
    const self = this;

    const vrContext: VRContext = {
      hands: {
        get left() {
          return self.vrProvider.getLeftHand();
        },
        get right() {
          return self.vrProvider.getRightHand();
        },
      },
      headset: {
        get position() {
          return self.vrProvider.getHeadsetPosition();
        },
        get rotation() {
          return self.vrProvider.getHeadsetRotation();
        },
      },
      getPointerRay(hand: 'left' | 'right') {
        return self.vrProvider.getPointerRay(hand);
      },
      getDominantHand() {
        return self.vrProvider.getDominantHand();
      },
    };

    const physicsContext: PhysicsContext = {
      applyVelocity(node: HSPlusNode, velocity: Vector3) {
        self.physicsProvider.applyVelocity(node.id || '', velocity);
      },
      applyAngularVelocity(node: HSPlusNode, angularVelocity: Vector3) {
        self.physicsProvider.applyAngularVelocity(node.id || '', angularVelocity);
      },
      setKinematic(node: HSPlusNode, kinematic: boolean) {
        self.physicsProvider.setKinematic(node.id || '', kinematic);
      },
      raycast(origin: Vector3, direction: Vector3, maxDistance: number): RaycastHit | null {
        return self.physicsProvider.raycast(origin, direction, maxDistance) as RaycastHit | null;
      },
      getBodyPosition(nodeId: string) {
        return self.physicsProvider.getBodyPosition?.(nodeId) || null;
      },
      getBodyVelocity(nodeId: string) {
        return self.physicsProvider.getBodyVelocity?.(nodeId) || null;
      },
    };

    const audioContext: TraitAudioContext = {
      playSound(source: string, options?: { position?: Vector3; volume?: number; spatial?: boolean }) {
        self.audioProvider.playSound(source, options);
      },
      updateSpatialSource(nodeId: string, options: { hrtfProfile?: string; occlusion?: number; reverbWet?: number }) {
        self.audioProvider.updateSpatialSource?.(nodeId, options);
      },
      registerAmbisonicSource(nodeId: string, order: number) {
        self.audioProvider.registerAmbisonicSource?.(nodeId, order);
      },
      setAudioPortal(portalId: string, targetZone: string, openingSize: number) {
        self.audioProvider.setAudioPortal?.(portalId, targetZone, openingSize);
      },
      updateAudioMaterial(nodeId: string, absorption: number, reflection: number) {
        self.audioProvider.updateAudioMaterial?.(nodeId, absorption, reflection);
      },
    };

    const hapticsContext: HapticsContext = {
      pulse(hand: 'left' | 'right', intensity: number, duration?: number) {
        self.hapticsProvider.pulse(hand, intensity, duration);
      },
      rumble(hand: 'left' | 'right', intensity: number) {
        self.hapticsProvider.rumble(hand, intensity);
      },
    };

    const accessibilityContext: AccessibilityContext | undefined = self.accessibilityProvider
      ? {
          announce(text: string) {
            self.accessibilityProvider!.announce(text);
          },
          setScreenReaderFocus(nodeId: string) {
            self.accessibilityProvider!.setScreenReaderFocus(nodeId);
          },
          setAltText(nodeId: string, text: string) {
            self.accessibilityProvider!.setAltText(nodeId, text);
          },
          setHighContrast(enabled: boolean) {
            self.accessibilityProvider!.setHighContrast(enabled);
          },
        }
      : undefined;

    return {
      vr: vrContext,
      physics: physicsContext,
      audio: audioContext,
      haptics: hapticsContext,
      accessibility: accessibilityContext,
      emit: (event: string, payload?: unknown) => self.emit(event, payload),
      getState: () => ({ ...self.globalState }),
      setState: (updates: Record<string, unknown>) => {
        Object.assign(self.globalState, updates);
      },
      getScaleMultiplier: () => SCALE_MULTIPLIERS[self.scaleMagnitude] ?? 1,
      setScaleContext: (magnitude: string) => {
        self.scaleMagnitude = magnitude;
      },
    };
  }

  // ---- Accessors ---------------------------------------------------------

  getNetworkProvider(): NetworkProvider | undefined {
    return this.networkProvider;
  }
  getRendererProvider(): RendererProvider | undefined {
    return this.rendererProvider;
  }

  dispose(): void {
    this.eventListeners.clear();
    this.globalState = {};
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTraitContextFactory(config?: TraitContextFactoryConfig): TraitContextFactory {
  return new TraitContextFactory(config);
}
