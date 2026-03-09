/**
 * CapabilityMatrix Production Tests
 *
 * Singleton lifecycle, profile management, feature registration,
 * feature support checking with fallback, and capability summary.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityMatrix,
  type CapabilityProfile,
  type FeatureRequirement,
} from '../CapabilityMatrix';

function makeProfile(overrides: any = {}): CapabilityProfile {
  return {
    id: 'test_profile',
    platform: 'web',
    renderingBackend: 'webgl2',
    userAgent: 'test',
    graphics: {
      maxTextureSize: 4096,
      maxCubeMapSize: 4096,
      maxRenderTargets: 4,
      maxVertexAttributes: 16,
      maxUniformBufferSize: 16384,
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
      audioWorklets: true,
      mediaRecording: true,
      speechRecognition: false,
      speechSynthesis: true,
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
      serviceWorker: true,
    },
    storage: {
      localStorage: true,
      localStorageQuota: 5242880,
      indexedDB: true,
      cacheAPI: true,
      fileSystemAccess: false,
      persistentStorage: true,
    },
    performance: {
      deviceTier: 3,
      gpuTier: 3,
      logicalProcessors: 8,
      sharedArrayBuffer: true,
      webAssembly: true,
      simd: false,
      multiThreading: true,
      offscreenCanvas: true,
    },
    detectedAt: new Date().toISOString(),
    custom: {},
    ...overrides,
  };
}

describe('CapabilityMatrix — Production', () => {
  beforeEach(() => {
    CapabilityMatrix.resetInstance();
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      const a = CapabilityMatrix.getInstance();
      const b = CapabilityMatrix.getInstance();
      expect(a).toBe(b);
    });

    it('resetInstance creates fresh instance', () => {
      const a = CapabilityMatrix.getInstance();
      CapabilityMatrix.resetInstance();
      const b = CapabilityMatrix.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('profile management', () => {
    it('starts with null profile', () => {
      expect(CapabilityMatrix.getInstance().getProfile()).toBeNull();
    });

    it('setProfile stores profile', () => {
      const cm = CapabilityMatrix.getInstance();
      const p = makeProfile();
      cm.setProfile(p);
      expect(cm.getProfile()).toBe(p);
    });
  });

  describe('feature registration', () => {
    it('registers and checks feature support', () => {
      const cm = CapabilityMatrix.getInstance();
      cm.setProfile(makeProfile());

      cm.registerFeature({
        name: 'hdr_rendering',
        checks: [{ capability: 'graphics.hdr', value: true, comparison: 'equals' }],
        critical: true,
      });

      expect(cm.isFeatureSupported('hdr_rendering')).toBe(true);
    });

    it('returns false for unsupported feature', () => {
      const cm = CapabilityMatrix.getInstance();
      cm.setProfile(makeProfile());

      cm.registerFeature({
        name: 'ray_tracing',
        checks: [{ capability: 'graphics.rayTracing', value: true, comparison: 'equals' }],
        critical: false,
      });

      expect(cm.isFeatureSupported('ray_tracing')).toBe(false);
    });

    it('returns false for unregistered feature', () => {
      expect(CapabilityMatrix.getInstance().isFeatureSupported('unknown')).toBe(false);
    });
  });

  describe('feature fallback', () => {
    it('returns feature name if supported', () => {
      const cm = CapabilityMatrix.getInstance();
      cm.setProfile(makeProfile());

      cm.registerFeature({
        name: 'spatial_audio',
        checks: [{ capability: 'audio.spatialAudio', value: true, comparison: 'equals' }],
        critical: false,
      });

      expect(cm.getFeatureOrFallback('spatial_audio')).toBe('spatial_audio');
    });

    it('returns fallback if primary not supported', () => {
      const cm = CapabilityMatrix.getInstance();
      cm.setProfile(makeProfile());

      cm.registerFeature({
        name: 'stereo_audio',
        checks: [],
        critical: false,
      });

      cm.registerFeature({
        name: 'ambisonics',
        checks: [{ capability: 'audio.ambisonics', value: true, comparison: 'equals' }],
        critical: false,
        fallback: 'stereo_audio',
      });

      expect(cm.getFeatureOrFallback('ambisonics')).toBe('stereo_audio');
    });
  });
});
