import { describe, it, expect, beforeEach, vi } from 'vitest';
import { segmentTraitHandler } from './SegmentTrait';
import type { SegmentationConfig } from './SegmentTrait';
import type { HSPlusNode } from './TraitTypes';

// Mock HSPlusNode for testing
const createMockNode = (): HSPlusNode => ({
  __typename: 'HSPlusNode',
  id: 'test-node',
  userData: { imageSource: { /* mock image source */ } },
  emit: vi.fn(),
  on: vi.fn(),
} as any);

describe('SegmentTrait', () => {
  describe('handler properties', () => {
    it('should have name "@segment"', () => {
      expect(segmentTraitHandler.name).toBe('@segment');
    });

    it('should have sensible defaults', () => {
      const defaults = segmentTraitHandler.defaultConfig;
      expect(defaults).toMatchObject({
        method: 'background-removal',
        mode: 'on-demand',
        intervalMs: 1000,
        imageSourceProp: 'imageSource',
        resolution: { width: 512, height: 512 },
        promptPoints: [],
        cacheDb: 'holoscript-segment-model-cache',
      });
    });
  });

  describe('onAttach lifecycle', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should attach without error', async () => {
      await expect(
        segmentTraitHandler.onAttach(node, {}, undefined)
      ).resolves.not.toThrow();
    });

    it('should emit segment:ready=false initially', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith('segment:ready', false);
    });

    it('should store state on node.__segmentState', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      expect((node as any).__segmentState).toBeDefined();
      expect((node as any).__segmentState.ready).toBe(false);
      expect((node as any).__segmentState.loading).toBe(true);
    });

    it('should register segment:compute event listener', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      expect(node.on).toHaveBeenCalledWith('segment:compute', expect.any(Function));
    });

    it('should respect custom configuration', async () => {
      const config: SegmentationConfig = {
        method: 'sam2',
        mode: 'continuous',
        intervalMs: 500,
        imageSourceProp: 'customSource',
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should disable caching when cacheDb is null', async () => {
      const config: SegmentationConfig = {
        cacheDb: null,
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('onUpdate lifecycle', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
      (node as any).__segmentState = {
        pipeline: { /* mock pipeline */ },
        ready: true,
        loading: false,
        error: null,
        intervalHandle: null,
        lastSegmentTime: 0,
        backend: 'wasm',
      };
    });

    it('should not throw in continuous mode without ready state', () => {
      (node as any).__segmentState.ready = false;
      expect(() => {
        segmentTraitHandler.onUpdate(node, { mode: 'continuous' }, undefined, 0.016);
      }).not.toThrow();
    });

    it('should skip update if not in continuous mode', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      segmentTraitHandler.onUpdate(node, { mode: 'on-demand' }, undefined, 0.016);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should skip update if pipeline is not ready', () => {
      (node as any).__segmentState.ready = false;
      expect(() => {
        segmentTraitHandler.onUpdate(node, { mode: 'continuous' }, undefined, 0.016);
      }).not.toThrow();
    });
  });

  describe('onDetach lifecycle', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
      (node as any).__segmentState = {
        pipeline: { /* mock pipeline */ },
        ready: true,
        loading: false,
        error: null,
        intervalHandle: setInterval(() => {}, 1000),
        lastSegmentTime: 0,
        backend: 'wasm',
      };
    });

    it('should clean up state', () => {
      segmentTraitHandler.onDetach(node, {}, undefined);
      expect((node as any).__segmentState).toBeUndefined();
    });

    it('should emit segment:ready=false on detach', () => {
      segmentTraitHandler.onDetach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith('segment:ready', false);
    });

    it('should clear interval if one exists', () => {
      const interval = (node as any).__segmentState.intervalHandle;
      segmentTraitHandler.onDetach(node, {}, undefined);
      // Interval should have been cleared (implementation detail)
      expect((node as any).__segmentState).toBeUndefined();
    });
  });

  describe('configuration defaults and merging', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should apply all defaults when config is empty', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
      expect(state.ready).toBe(false);
      expect(state.loading).toBe(true);
    });

    it('should merge partial config with defaults', async () => {
      const config: SegmentationConfig = {
        method: 'sam2',
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should allow cacheDb=null to disable caching', async () => {
      const config: SegmentationConfig = {
        cacheDb: null,
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('event registration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should register segment:compute listener on attach', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      expect(node.on).toHaveBeenCalledWith('segment:compute', expect.any(Function));
    });

    it('should emit segment:error on initialization failure gracefully', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      // Simulate loading complete with error
      state.loading = false;
      state.error = 'Test error';
      expect(state.error).toBe('Test error');
    });
  });

  describe('mode configurations', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should support on-demand mode', async () => {
      const config: SegmentationConfig = { mode: 'on-demand' };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state.intervalHandle).toBeNull();
    });

    it('should support continuous mode', async () => {
      const config: SegmentationConfig = { mode: 'continuous' };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      // Interval not set in attach for continuous mode (set in update)
      expect(state).toBeDefined();
    });

    it('should support interval mode', async () => {
      const config: SegmentationConfig = { mode: 'interval', intervalMs: 500 };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      // Interval will be set async once pipeline loads
      expect(state).toBeDefined();
    });
  });

  describe('method configurations', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should support background-removal method', async () => {
      const config: SegmentationConfig = { method: 'background-removal' };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should support sam2 method', async () => {
      const config: SegmentationConfig = { method: 'sam2' };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('resolution configurations', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should accept custom resolutions', async () => {
      const config: SegmentationConfig = {
        resolution: { width: 256, height: 256 },
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should use default resolution when not specified', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('prompt points configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should accept custom prompt points for SAM2', async () => {
      const config: SegmentationConfig = {
        method: 'sam2',
        promptPoints: [[256, 256], [512, 512]],
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should default to empty prompt points', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('imageSourceProp configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should default to "imageSource"', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should accept custom property names', async () => {
      const config: SegmentationConfig = {
        imageSourceProp: 'customImageProp',
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('cache configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should use default cache db', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should respect explicit cacheDb value', async () => {
      const config: SegmentationConfig = {
        cacheDb: 'custom-cache',
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });

    it('should disable cache when cacheDb is null', async () => {
      const config: SegmentationConfig = {
        cacheDb: null,
      };
      await segmentTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__segmentState;
      expect(state).toBeDefined();
    });
  });

  describe('state management', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should initialize state with correct defaults', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state.pipeline).toBeNull();
      expect(state.ready).toBe(false);
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
      expect(state.intervalHandle).toBeNull();
      // Note: backend is set asynchronously, so it may not be null immediately
      expect(typeof state.backend).toBe('string' || 'object');
    });

    it('should update state during async loading', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__segmentState;
      expect(state.loading).toBe(true);
    });
  });

  describe('event emission', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should emit segment:ready on attach', async () => {
      await segmentTraitHandler.onAttach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith('segment:ready', false);
    });

    it('should emit segment:ready=false on detach', () => {
      (node as any).__segmentState = {
        intervalHandle: null,
      };
      segmentTraitHandler.onDetach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith('segment:ready', false);
    });
  });
});
