import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityMatrix,
  createFeatureRequirement,
  type CapabilityProfile,
  type FeatureRequirement,
} from '../CapabilityMatrix';

function makeProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    id: 'test',
    platform: 'web',
    renderingBackend: 'webgl2',
    userAgent: 'test',
    graphics: {
      maxTextureSize: 4096,
      maxCubeMapSize: 4096,
      maxRenderTargets: 8,
      maxVertexAttributes: 16,
      maxUniformBufferSize: 65536,
      compressedTextures: {
        s3tc: true,
        etc1: false,
        etc2: false,
        astc: false,
        pvrtc: false,
        bc7: false,
      },
      hdr: true,
      instancing: true,
      computeShaders: false,
      geometryShaders: false,
      tessellation: false,
      rayTracing: false,
      meshShaders: false,
      maxMSAASamples: 4,
      anisotropicFiltering: true,
      maxAnisotropy: 16,
    },
    xr: {
      supported: false,
      modes: ['none'],
      handTracking: false,
      eyeTracking: false,
      bodyTracking: false,
      faceTracking: false,
      spatialAnchors: false,
      sceneUnderstanding: false,
      passthrough: false,
      depthSensing: false,
      maxRefreshRate: 60,
      foveatedRendering: false,
      haptics: false,
    },
    audio: {
      webAudio: true,
      spatialAudio: true,
      maxAudioSources: 32,
      hrtf: true,
      audioWorklets: false,
      mediaRecording: false,
      speechRecognition: false,
      speechSynthesis: false,
    },
    input: {
      touch: false,
      maxTouchPoints: 0,
      pointerLock: true,
      gamepad: true,
      keyboard: true,
      deviceOrientation: false,
      deviceMotion: false,
      pressureSensitivity: false,
      tilt: false,
    },
    network: {
      webSocket: true,
      webRTC: true,
      serverSentEvents: true,
      fetch: true,
      networkInformation: false,
      backgroundSync: false,
      serviceWorker: false,
    },
    storage: {
      localStorage: true,
      localStorageQuota: 5242880,
      indexedDB: true,
      cacheAPI: false,
      fileSystemAccess: false,
      persistentStorage: false,
    },
    performance: {
      deviceTier: 3,
      gpuTier: 3,
      logicalProcessors: 8,
      sharedArrayBuffer: false,
      webAssembly: true,
      simd: false,
      multiThreading: false,
      offscreenCanvas: false,
    },
    detectedAt: new Date().toISOString(),
    custom: {},
    ...overrides,
  } as CapabilityProfile;
}

describe('CapabilityMatrix', () => {
  beforeEach(() => {
    CapabilityMatrix.resetInstance();
  });

  it('getInstance returns singleton', () => {
    const a = CapabilityMatrix.getInstance();
    const b = CapabilityMatrix.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance clears singleton', () => {
    const a = CapabilityMatrix.getInstance();
    CapabilityMatrix.resetInstance();
    const b = CapabilityMatrix.getInstance();
    expect(a).not.toBe(b);
  });

  it('getProfile returns null before detection', () => {
    const m = CapabilityMatrix.getInstance();
    expect(m.getProfile()).toBeNull();
  });

  it('setProfile stores profile', () => {
    const m = CapabilityMatrix.getInstance();
    const p = makeProfile();
    m.setProfile(p);
    expect(m.getProfile()).toBe(p);
  });

  it('registerFeature + isFeatureSupported (equals check)', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile({ renderingBackend: 'webgpu' }));
    m.registerFeature(
      createFeatureRequirement('webgpu', [
        { capability: 'renderingBackend', value: 'webgpu', comparison: 'equals' },
      ])
    );
    expect(m.isFeatureSupported('webgpu')).toBe(true);
  });

  it('isFeatureSupported returns false when check fails', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile({ renderingBackend: 'webgl2' }));
    m.registerFeature(
      createFeatureRequirement('webgpu', [
        { capability: 'renderingBackend', value: 'webgpu', comparison: 'equals' },
      ])
    );
    expect(m.isFeatureSupported('webgpu')).toBe(false);
  });

  it('gte comparison works', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement('highEnd', [
        { capability: 'performance.deviceTier', value: 3, comparison: 'gte' },
      ])
    );
    expect(m.isFeatureSupported('highEnd')).toBe(true);
  });

  it('lt comparison works', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement('lowEnd', [
        { capability: 'performance.deviceTier', value: 2, comparison: 'lt' },
      ])
    );
    expect(m.isFeatureSupported('lowEnd')).toBe(false);
  });

  it('contains comparison works for arrays', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(
      makeProfile({
        xr: { ...makeProfile().xr, supported: true, modes: ['vr', 'ar'] },
      })
    );
    m.registerFeature(
      createFeatureRequirement('vrSupport', [
        { capability: 'xr.modes', value: 'vr', comparison: 'contains' },
      ])
    );
    expect(m.isFeatureSupported('vrSupport')).toBe(true);
  });

  it('exists comparison works', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement('hasAudio', [
        { capability: 'audio', value: null, comparison: 'exists' },
      ])
    );
    expect(m.isFeatureSupported('hasAudio')).toBe(true);
  });

  it('getFeatureOrFallback returns feature if supported', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement('hdrRendering', [
        { capability: 'graphics.hdr', value: true, comparison: 'equals' },
      ])
    );
    expect(m.getFeatureOrFallback('hdrRendering')).toBe('hdrRendering');
  });

  it('getFeatureOrFallback returns fallback', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement(
        'rayTracing',
        [{ capability: 'graphics.rayTracing', value: true, comparison: 'equals' }],
        { fallback: 'rasterization' }
      )
    );
    m.registerFeature(
      createFeatureRequirement('rasterization', [
        { capability: 'graphics.instancing', value: true, comparison: 'equals' },
      ])
    );
    expect(m.getFeatureOrFallback('rayTracing')).toBe('rasterization');
  });

  it('getUnsupportedCriticalFeatures lists critical misses', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement(
        'compute',
        [{ capability: 'graphics.computeShaders', value: true, comparison: 'equals' }],
        { critical: true }
      )
    );
    expect(m.getUnsupportedCriticalFeatures()).toContain('compute');
  });

  it('getSummary reports supported/unsupported', () => {
    const m = CapabilityMatrix.getInstance();
    m.setProfile(makeProfile());
    m.registerFeature(
      createFeatureRequirement('hdr', [
        { capability: 'graphics.hdr', value: true, comparison: 'equals' },
      ])
    );
    m.registerFeature(
      createFeatureRequirement('rt', [
        { capability: 'graphics.rayTracing', value: true, comparison: 'equals' },
      ])
    );
    const summary = m.getSummary();
    expect(summary.supportedFeatures).toContain('hdr');
    expect(summary.unsupportedFeatures).toContain('rt');
    expect(summary.platform).toBe('web');
  });

  it('createFeatureRequirement sets defaults', () => {
    const f = createFeatureRequirement('test', []);
    expect(f.critical).toBe(false);
    expect(f.fallback).toBeUndefined();
  });

  it('features re-evaluate when profile changes', () => {
    const m = CapabilityMatrix.getInstance();
    m.registerFeature(
      createFeatureRequirement('compute', [
        { capability: 'graphics.computeShaders', value: true, comparison: 'equals' },
      ])
    );
    m.setProfile(makeProfile());
    expect(m.isFeatureSupported('compute')).toBe(false);
    // Set new profile with compute shaders
    const p2 = makeProfile();
    p2.graphics.computeShaders = true;
    m.setProfile(p2);
    expect(m.isFeatureSupported('compute')).toBe(true);
  });
});
