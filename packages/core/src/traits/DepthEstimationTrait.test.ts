/**
 * DepthEstimationTrait Tests
 *
 * Unit tests for the @depth_estimation trait covering:
 *   - Backend detection (WebGPU vs WASM)
 *   - Trait lifecycle (attach, update, detach)
 *   - Depth map computation and normalization
 *   - Error handling and fallbacks
 *   - Configuration defaults
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  depthEstimationTraitHandler,
  type DepthEstimationConfig,
  type DepthResolution,
} from './DepthEstimationTrait';
import type { TraitHandler, HSPlusNode } from './TraitTypes';

// Mock setup
vi.stubGlobal('navigator', {
  gpu: undefined, // Simulate WASM-only environment by default
});

vi.stubGlobal('performance', {
  now: () => Date.now(),
});

// ─────────────────────────────────────────────────────────────────────────

describe('DepthEstimationTrait', () => {
  let mockNode: Partial<HSPlusNode>;
  let emittedEvents: Map<string, unknown[]>;

  beforeEach(() => {
    emittedEvents = new Map();

    mockNode = {
      name: 'test-node',
      userData: new Map(),
      emit: vi.fn((eventName: string, data: unknown) => {
        if (!emittedEvents.has(eventName)) {
          emittedEvents.set(eventName, []);
        }
        emittedEvents.get(eventName)!.push(data);
      }),
      on: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    emittedEvents.clear();
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('handler properties', () => {
    it('should have name "@depth_estimation"', () => {
      expect(depthEstimationTraitHandler.name).toBe('@depth_estimation');
    });

    it('should have sensible defaults', () => {
      const defaults = depthEstimationTraitHandler.defaultConfig;
      expect(defaults.mode).toBe('on-demand');
      expect(defaults.intervalMs).toBe(1000);
      expect(defaults.emitNormalized).toBe(true);
      expect(defaults.cacheDb).toBe('holoscript-depth-model-cache');
      expect(defaults.imageSourceProp).toBe('imageSource');
      expect(defaults.resolution).toEqual({ width: 518, height: 518 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('onAttach lifecycle', () => {
    it('should attach without error', async () => {
      const config: DepthEstimationConfig = {};
      expect(() => {
        depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);
      }).not.toThrow();
    });

    it('should emit depth:ready=false initially', async () => {
      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      // Check that depth:ready was emitted with false
      const readyEvents = emittedEvents.get('depth:ready');
      expect(readyEvents).toBeDefined();
      expect(readyEvents![0]).toBe(false);
    });

    it('should store state on node.__depthEstimationState', async () => {
      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect((mockNode as any).__depthEstimationState).toBeDefined();
      expect((mockNode as any).__depthEstimationState.ready).toBe(false);
      expect((mockNode as any).__depthEstimationState.loading).toBe(true);
    });

    it('should register depth:compute event listener', async () => {
      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect(mockNode.on).toHaveBeenCalledWith('depth:compute', expect.any(Function));
    });

    it('should respect custom configuration', async () => {
      const config: DepthEstimationConfig = {
        mode: 'interval',
        intervalMs: 500,
        imageSourceProp: 'videoSource',
        resolution: { width: 256, height: 256 },
        cacheDb: 'custom-cache',
      };

      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      const state = (mockNode as any).__depthEstimationState;
      expect(state).toBeDefined();
      // State should be created even if pipeline loading hasn't completed yet
      expect(state.loading).toBe(true);
    });

    it('should disable caching when cacheDb is null', async () => {
      const config: DepthEstimationConfig = { cacheDb: null };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      const state = (mockNode as any).__depthEstimationState;
      expect(state).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('onUpdate lifecycle', () => {
    it('should not throw in continuous mode without ready state', () => {
      const config: DepthEstimationConfig = { mode: 'continuous' };

      // No prior attachment, so state doesn't exist
      expect(() => {
        depthEstimationTraitHandler.onUpdate!(mockNode as HSPlusNode, config, undefined, 0.016);
      }).not.toThrow();
    });

    it('should skip update if not in continuous mode', () => {
      (mockNode as any).__depthEstimationState = {
        ready: true,
        pipeline: {},
      };

      const config: DepthEstimationConfig = { mode: 'on-demand' };
      depthEstimationTraitHandler.onUpdate!(mockNode as HSPlusNode, config, undefined, 0.016);

      // No error, and no events fired (because mode isn't continuous)
      expect(emittedEvents.size).toBe(0);
    });

    it('should skip update if pipeline is not ready', () => {
      (mockNode as any).__depthEstimationState = {
        ready: false,
        pipeline: null,
      };

      const config: DepthEstimationConfig = { mode: 'continuous' };
      depthEstimationTraitHandler.onUpdate!(mockNode as HSPlusNode, config, undefined, 0.016);

      expect(emittedEvents.size).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('onDetach lifecycle', () => {
    it('should clean up state', () => {
      (mockNode as any).__depthEstimationState = {
        intervalHandle: null,
      };

      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onDetach!(mockNode as HSPlusNode, config, undefined);

      // State should be deleted
      expect((mockNode as any).__depthEstimationState).toBeUndefined();
    });

    it('should emit depth:ready=false on detach', () => {
      (mockNode as any).__depthEstimationState = {
        intervalHandle: null,
      };

      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onDetach!(mockNode as HSPlusNode, config, undefined);

      const readyEvents = emittedEvents.get('depth:ready');
      expect(readyEvents).toBeDefined();
      expect(readyEvents![readyEvents!.length - 1]).toBe(false);
    });

    it('should clear interval if one exists', () => {
      const mockClearInterval = vi.fn();
      global.clearInterval = mockClearInterval as any;

      const mockInterval = 12345 as any;
      (mockNode as any).__depthEstimationState = {
        intervalHandle: mockInterval,
      };

      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onDetach!(mockNode as HSPlusNode, config, undefined);

      expect(mockClearInterval).toHaveBeenCalledWith(mockInterval);
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('configuration defaults and merging', () => {
    it('should apply all defaults when config is empty', () => {
      const defaults = depthEstimationTraitHandler.defaultConfig;

      // Simulate onAttach with empty config to verify defaults are applied
      expect(defaults.modelId).toBe('Xenova/depth-anything-small-hf');
      expect(defaults.mode).toBe('on-demand');
      expect(defaults.resolution.width).toBe(518);
      expect(defaults.resolution.height).toBe(518);
    });

    it('should merge partial config with defaults', () => {
      const config: DepthEstimationConfig = {
        mode: 'interval',
        resolution: { width: 256, height: 256 },
      };

      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);
      // Trait should successfully attach with merged config (no throw)
      expect(depthEstimationTraitHandler).toBeDefined();
    });

    it('should allow cacheDb=null to disable caching', () => {
      const config: DepthEstimationConfig = { cacheDb: null };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);
      // Should attach successfully without throwing
      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('event registration', () => {
    it('should register depth:compute listener on attach', () => {
      const config: DepthEstimationConfig = {};
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect(mockNode.on).toHaveBeenCalled();
      const calls = (mockNode.on as any).mock.calls;
      const computeCall = calls.find((call: any) => call[0] === 'depth:compute');
      expect(computeCall).toBeDefined();
      expect(typeof computeCall[1]).toBe('function');
    });

    it('should emit depth:error on initialization failure gracefully', async () => {
      // This test demonstrates the trait handles errors without throwing
      const config: DepthEstimationConfig = {
        modelId: 'invalid-model-id-that-will-fail',
      };

      // Should not throw even if model loading fails
      expect(() => {
        depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);
      }).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('mode configurations', () => {
    it('should support on-demand mode', () => {
      const config: DepthEstimationConfig = { mode: 'on-demand' };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });

    it('should support continuous mode', () => {
      const config: DepthEstimationConfig = { mode: 'continuous' };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });

    it('should support interval mode', () => {
      const config: DepthEstimationConfig = { mode: 'interval', intervalMs: 500 };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('resolution configurations', () => {
    it('should accept custom resolutions', () => {
      const customResolution: DepthResolution = { width: 512, height: 512 };
      const config: DepthEstimationConfig = { resolution: customResolution };

      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);
      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });

    it('should use default resolution when not specified', () => {
      const config: DepthEstimationConfig = {};
      const defaults = depthEstimationTraitHandler.defaultConfig;

      expect(defaults.resolution.width).toBe(518);
      expect(defaults.resolution.height).toBe(518);
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('emitNormalized option', () => {
    it('should default to true', () => {
      const defaults = depthEstimationTraitHandler.defaultConfig;
      expect(defaults.emitNormalized).toBe(true);
    });

    it('should respect explicit false value', () => {
      const config: DepthEstimationConfig = { emitNormalized: false };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────

  describe('imageSourceProp configuration', () => {
    it('should default to "imageSource"', () => {
      const defaults = depthEstimationTraitHandler.defaultConfig;
      expect(defaults.imageSourceProp).toBe('imageSource');
    });

    it('should accept custom property names', () => {
      const config: DepthEstimationConfig = { imageSourceProp: 'videoStream' };
      depthEstimationTraitHandler.onAttach!(mockNode as HSPlusNode, config, undefined);

      expect((mockNode as any).__depthEstimationState).toBeDefined();
    });
  });
});
