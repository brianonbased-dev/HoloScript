import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityMatrix,
  getCapabilityMatrix,
  createFeatureRequirement,
  CommonFeatures,
} from '../CapabilityMatrix';
import type { CapabilityProfile, CapabilityCheck } from '../CapabilityMatrix';

/** Build a mock CapabilityProfile for testing feature evaluation */
function makeMockProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    id: 'test-profile',
    platform: 'web_desktop',
    renderingBackend: 'webgpu',
    userAgent: 'test-agent',
    graphics: {
      maxTextureSize: 4096,
      maxCubeMapSize: 2048,
      maxRenderTargets: 8,
      maxVertexAttributes: 16,
      maxUniformBufferSize: 65536,
      compressedTextures: {
        s3tc: true,
        etc1: false,
        etc2: false,
        astc: false,
        pvrtc: false,
        bc7: true,
      },
      hdr: true,
      instancing: true,
      computeShaders: true,
      geometryShaders: false,
      tessellation: false,
      rayTracing: false,
      meshShaders: false,
      maxMSAASamples: 4,
      anisotropicFiltering: true,
      maxAnisotropy: 16,
    },
    xr: {
      supported: true,
      modes: ['vr', 'ar'],
      handTracking: true,
      eyeTracking: false,
      bodyTracking: false,
      faceTracking: false,
      spatialAnchors: true,
      sceneUnderstanding: false,
      passthrough: true,
      depthSensing: false,
      maxRefreshRate: 90,
      foveatedRendering: false,
      haptics: true,
    },
    audio: {
      webAudio: true,
      spatialAudio: true,
      maxAudioSources: 32,
      hrtf: true,
      audioWorklets: true,
      mediaRecording: true,
      speechRecognition: false,
      speechSynthesis: true,
    },
    input: {
      touch: true,
      maxTouchPoints: 10,
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
      serviceWorker: true,
    },
    storage: {
      localStorage: true,
      localStorageQuota: 5_000_000,
      indexedDB: true,
      cacheAPI: true,
      fileSystemAccess: false,
      persistentStorage: true,
    },
    performance: {
      deviceTier: 3,
      gpuTier: 3,
      availableMemory: 8192,
      logicalProcessors: 8,
      sharedArrayBuffer: true,
      webAssembly: true,
      simd: true,
      multiThreading: true,
      offscreenCanvas: true,
    },
    detectedAt: new Date().toISOString(),
    custom: {},
    ...overrides,
  } as CapabilityProfile;
}

describe('CapabilityMatrix', () => {
  let matrix: CapabilityMatrix;

  beforeEach(() => {
    CapabilityMatrix.resetInstance();
    matrix = CapabilityMatrix.getInstance();
  });

  // ===========================================================================
  // Singleton
  // ===========================================================================
  describe('singleton', () => {
    it('getInstance returns same instance', () => {
      const a = CapabilityMatrix.getInstance();
      const b = CapabilityMatrix.getInstance();
      expect(a).toBe(b);
    });

    it('resetInstance allows new instance', () => {
      const a = CapabilityMatrix.getInstance();
      CapabilityMatrix.resetInstance();
      const b = CapabilityMatrix.getInstance();
      expect(a).not.toBe(b);
    });
  });

  // ===========================================================================
  // Profile
  // ===========================================================================
  describe('profile', () => {
    it('getProfile returns null before detection', () => {
      expect(matrix.getProfile()).toBeNull();
    });

    it('setProfile sets the profile', () => {
      const profile = makeMockProfile();
      matrix.setProfile(profile);
      expect(matrix.getProfile()).not.toBeNull();
      expect(matrix.getProfile()!.id).toBe('test-profile');
    });
  });

  // ===========================================================================
  // Feature Registration
  // ===========================================================================
  describe('feature registration', () => {
    it('registerFeature adds a feature', () => {
      const feature = createFeatureRequirement('test-feature', [
        { capability: 'graphics.computeShaders', value: true, comparison: 'equals' },
      ]);
      matrix.registerFeature(feature);
      // After setting profile, feature should be evaluable
      matrix.setProfile(makeMockProfile());
      expect(matrix.isFeatureSupported('test-feature')).toBe(true);
    });

    it('unsupported feature returns false', () => {
      const feature = createFeatureRequirement('ray-tracing', [
        { capability: 'graphics.rayTracing', value: true, comparison: 'equals' },
      ]);
      matrix.registerFeature(feature);
      matrix.setProfile(makeMockProfile()); // rayTracing is false
      expect(matrix.isFeatureSupported('ray-tracing')).toBe(false);
    });

    it('getFeatureOrFallback returns fallback for unsupported', () => {
      // Register the fallback feature as a supported capability first
      // (getFeatureOrFallback checks isFeatureSupported on the fallback)
      const rasterFeature = createFeatureRequirement('rasterization', [
        { capability: 'renderingBackend', value: 'webgpu', comparison: 'exists' },
      ]);
      matrix.registerFeature(rasterFeature);

      const feature = createFeatureRequirement(
        'ray-tracing',
        [{ capability: 'graphics.rayTracing', value: true, comparison: 'equals' }],
        { fallback: 'rasterization' },
      );
      matrix.registerFeature(feature);
      matrix.setProfile(makeMockProfile());
      const result = matrix.getFeatureOrFallback('ray-tracing');
      expect(result).toBe('rasterization');
    });

    it('getFeatureOrFallback returns feature name when supported', () => {
      const feature = createFeatureRequirement('compute', [
        { capability: 'graphics.computeShaders', value: true, comparison: 'equals' },
      ], { fallback: 'cpu-fallback' });
      matrix.registerFeature(feature);
      matrix.setProfile(makeMockProfile());
      expect(matrix.getFeatureOrFallback('compute')).toBe('compute');
    });
  });

  // ===========================================================================
  // Critical Features
  // ===========================================================================
  describe('critical features', () => {
    it('getUnsupportedCriticalFeatures returns unsupported critical ones', () => {
      const feature = createFeatureRequirement(
        'mesh-shaders',
        [{ capability: 'graphics.meshShaders', value: true, comparison: 'equals' }],
        { critical: true },
      );
      matrix.registerFeature(feature);
      matrix.setProfile(makeMockProfile());
      const unsupported = matrix.getUnsupportedCriticalFeatures();
      expect(unsupported).toContain('mesh-shaders');
    });
  });

  // ===========================================================================
  // Comparison Operators
  // ===========================================================================
  describe('comparison operators', () => {
    beforeEach(() => {
      matrix.setProfile(makeMockProfile());
    });

    it('gte check works', () => {
      const feature = createFeatureRequirement('high-msaa', [
        { capability: 'graphics.maxMSAASamples', value: 4, comparison: 'gte' },
      ]);
      matrix.registerFeature(feature);
      expect(matrix.isFeatureSupported('high-msaa')).toBe(true);
    });

    it('gt check works', () => {
      const feature = createFeatureRequirement('many-processors', [
        { capability: 'performance.logicalProcessors', value: 4, comparison: 'gt' },
      ]);
      matrix.registerFeature(feature);
      expect(matrix.isFeatureSupported('many-processors')).toBe(true);
    });

    it('lte check works', () => {
      const feature = createFeatureRequirement('low-tier', [
        { capability: 'performance.deviceTier', value: 5, comparison: 'lte' },
      ]);
      matrix.registerFeature(feature);
      expect(matrix.isFeatureSupported('low-tier')).toBe(true);
    });

    it('exists check works', () => {
      const feature = createFeatureRequirement('has-memory', [
        { capability: 'performance.availableMemory', value: true, comparison: 'exists' },
      ]);
      matrix.registerFeature(feature);
      expect(matrix.isFeatureSupported('has-memory')).toBe(true);
    });
  });

  // ===========================================================================
  // Summary
  // ===========================================================================
  describe('getSummary', () => {
    it('returns summary after profile set', () => {
      matrix.setProfile(makeMockProfile());
      const summary = matrix.getSummary();
      expect(summary).toBeDefined();
      expect(summary.platform).toBe('web_desktop');
      expect(summary.xrSupported).toBe(true);
      expect(summary.deviceTier).toBe(3);
    });
  });

  // ===========================================================================
  // Factory Functions
  // ===========================================================================
  describe('factory functions', () => {
    it('getCapabilityMatrix returns an instance', () => {
      expect(getCapabilityMatrix()).toBeDefined();
    });

    it('createFeatureRequirement returns a feature', () => {
      const feature = createFeatureRequirement('test', [
        { capability: 'xr.supported', value: true, comparison: 'equals' },
      ]);
      expect(feature.name).toBe('test');
      expect(feature.checks).toHaveLength(1);
    });
  });

  // ===========================================================================
  // CommonFeatures
  // ===========================================================================
  describe('CommonFeatures', () => {
    it('webgpu feature exists', () => {
      expect(CommonFeatures.webgpu).toBeDefined();
      expect(CommonFeatures.webgpu.name).toBe('webgpu');
    });

    it('computeShaders feature exists', () => {
      expect(CommonFeatures.computeShaders).toBeDefined();
    });

    it('spatialAudio feature exists', () => {
      expect(CommonFeatures.spatialAudio).toBeDefined();
    });
  });
});
