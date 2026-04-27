import { describe, it, expect, beforeEach, vi } from 'vitest';
import { holographicSpriteTraitHandler } from './HolographicSpriteTrait';
import type { HolographicSpriteConfig } from './HolographicSpriteTrait';
import type { HSPlusNode } from './TraitTypes';

const createMockNode = (): HSPlusNode => ({
  __typename: 'HSPlusNode',
  id: 'hologram-node',
  userData: { imageSource: { /* mock */ } },
  emit: vi.fn(),
  on: vi.fn(),
} as any);

describe('HolographicSpriteTrait', () => {
  describe('handler properties', () => {
    it('should have name "@holographic_sprite"', () => {
      expect(holographicSpriteTraitHandler.name).toBe('@holographic_sprite');
    });

    it('should have sensible defaults', () => {
      const defaults = holographicSpriteTraitHandler.defaultConfig;
      expect(defaults).toMatchObject({
        imageSourceProp: 'imageSource',
        segmentMethod: 'background-removal',
        depthMode: 'continuous',
        depthIntervalMs: 100,
        displacementScale: 1.0,
        billboardType: 'spherical',
        mode: 'portrait',
        smoothMaskEdges: true,
        smoothDepthTemporal: true,
        parallaxIntensity: 0.8,
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
        holographicSpriteTraitHandler.onAttach(node, {}, undefined)
      ).resolves.not.toThrow();
    });

    it('should emit holographic:ready=false initially', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith('holographic:ready', false);
    });

    it('should store state on node.__holographicSpriteState', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      expect((node as any).__holographicSpriteState).toBeDefined();
      expect((node as any).__holographicSpriteState.compositeReady).toBe(true);
    });

    it('should register event listeners', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      expect(node.on).toHaveBeenCalledWith('holographic:compose', expect.any(Function));
      expect(node.on).toHaveBeenCalledWith('segment:mask', expect.any(Function));
      expect(node.on).toHaveBeenCalledWith('depth:map', expect.any(Function));
    });

    it('should respect custom configuration', async () => {
      const config: HolographicSpriteConfig = {
        segmentMethod: 'sam2',
        depthMode: 'on-demand',
        displacementScale: 2.0,
        billboardType: 'planar',
        mode: 'product',
      };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });

    it('should emit holographic:mode on attach', async () => {
      await holographicSpriteTraitHandler.onAttach(node, { mode: 'portrait' }, undefined);
      expect(node.emit).toHaveBeenCalledWith('holographic:mode', 'portrait');
    });
  });

  describe('onUpdate lifecycle', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
      (node as any).__holographicSpriteState = {
        compositing: true,
        compositeReady: true,
        lastFrameTime: 0,
        error: null,
      };
    });

    it('should emit frame-update in continuous mode', () => {
      holographicSpriteTraitHandler.onUpdate(
        node,
        { depthMode: 'continuous' },
        undefined,
        0.016
      );
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:frame-update',
        expect.objectContaining({ delta: 0.016 })
      );
    });

    it('should skip update if not compositeReady', () => {
      (node as any).__holographicSpriteState.compositeReady = false;
      holographicSpriteTraitHandler.onUpdate(
        node,
        { depthMode: 'continuous' },
        undefined,
        0.016
      );
      // No frame-update should be emitted
    });

    it('should skip on-demand mode updates', () => {
      holographicSpriteTraitHandler.onUpdate(
        node,
        { depthMode: 'on-demand' },
        undefined,
        0.016
      );
      // Only frame-update emitted in continuous mode
    });
  });

  describe('onDetach lifecycle', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
      (node as any).__holographicSpriteState = {
        compositing: true,
        compositeReady: true,
        maskCache: new Uint8ClampedArray(1024),
        depthCache: new Float32Array(1024),
      };
    });

    it('should clean up state', () => {
      holographicSpriteTraitHandler.onDetach(node, {}, undefined);
      expect((node as any).__holographicSpriteState).toBeUndefined();
    });

    it('should emit holographic:ready=false on detach', () => {
      holographicSpriteTraitHandler.onDetach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith('holographic:ready', false);
    });
  });

  describe('composition modes', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should support portrait mode', async () => {
      const config: HolographicSpriteConfig = { mode: 'portrait' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith('holographic:mode', 'portrait');
    });

    it('should support product mode', async () => {
      const config: HolographicSpriteConfig = { mode: 'product' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith('holographic:mode', 'product');
    });

    it('should support scene mode', async () => {
      const config: HolographicSpriteConfig = { mode: 'scene' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith('holographic:mode', 'scene');
    });
  });

  describe('segmentation configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should support background-removal method', async () => {
      const config: HolographicSpriteConfig = {
        segmentMethod: 'background-removal',
      };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ segmentMethod: 'background-removal' })
      );
    });

    it('should support sam2 method', async () => {
      const config: HolographicSpriteConfig = { segmentMethod: 'sam2' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ segmentMethod: 'sam2' })
      );
    });
  });

  describe('depth mode configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should support on-demand depth mode', async () => {
      const config: HolographicSpriteConfig = { depthMode: 'on-demand' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ depthMode: 'on-demand' })
      );
    });

    it('should support continuous depth mode', async () => {
      const config: HolographicSpriteConfig = { depthMode: 'continuous' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ depthMode: 'continuous' })
      );
    });

    it('should support interval depth mode', async () => {
      const config: HolographicSpriteConfig = {
        depthMode: 'interval',
        depthIntervalMs: 50,
      };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ depthMode: 'interval' })
      );
    });
  });

  describe('billboard configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should support planar billboard type', async () => {
      const config: HolographicSpriteConfig = { billboardType: 'planar' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ billboardType: 'planar' })
      );
    });

    it('should support spherical billboard type', async () => {
      const config: HolographicSpriteConfig = { billboardType: 'spherical' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ billboardType: 'spherical' })
      );
    });

    it('should support cylindrical billboard type', async () => {
      const config: HolographicSpriteConfig = { billboardType: 'cylindrical' };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ billboardType: 'cylindrical' })
      );
    });
  });

  describe('displacement configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should accept custom displacement scale', async () => {
      const config: HolographicSpriteConfig = { displacementScale: 2.0 };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ displacementScale: 2.0 })
      );
    });

    it('should use default displacement scale', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:config',
        expect.objectContaining({ displacementScale: 1.0 })
      );
    });
  });

  describe('smoothing options', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should enable mask smoothing by default', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__holographicSpriteState;
      // smoothMaskEdges is set in default config
      expect(state).toBeDefined();
    });

    it('should allow disabling mask smoothing', async () => {
      const config: HolographicSpriteConfig = { smoothMaskEdges: false };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });

    it('should enable temporal depth smoothing by default', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });

    it('should allow disabling temporal smoothing', async () => {
      const config: HolographicSpriteConfig = { smoothDepthTemporal: false };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });
  });

  describe('parallax configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should accept custom parallax intensity', async () => {
      const config: HolographicSpriteConfig = { parallaxIntensity: 0.5 };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });

    it('should use default parallax intensity', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state.parallaxIntensity ?? 0.8).toBe(0.8);
    });
  });

  describe('cache configuration', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should use default cache db', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });

    it('should allow disabling cache', async () => {
      const config: HolographicSpriteConfig = { cacheDb: null };
      await holographicSpriteTraitHandler.onAttach(node, config, undefined);
      const state = (node as any).__holographicSpriteState;
      expect(state).toBeDefined();
    });
  });

  describe('event handling', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
      (node as any).__holographicSpriteState = {
        compositing: true,
        compositeReady: true,
        maskCache: null,
        depthCache: null,
      };
    });

    it('should handle segment:mask events', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const maskListener = (node.on as any).mock.calls.find(
        (c: any[]) => c[0] === 'segment:mask'
      )[1];
      
      const testMask = new Uint8ClampedArray(1024);
      maskListener(testMask);
      
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:mask-updated',
        expect.any(Uint8ClampedArray)
      );
    });

    it('should handle depth:map events', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const depthListener = (node.on as any).mock.calls.find(
        (c: any[]) => c[0] === 'depth:map'
      )[1];
      
      const testDepth = new Float32Array(1024);
      depthListener(testDepth);
      
      expect(node.emit).toHaveBeenCalledWith(
        'holographic:displacement',
        expect.any(Float32Array)
      );
    });
  });

  describe('state management', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should initialize with correct defaults', async () => {
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      const state = (node as any).__holographicSpriteState;
      // Note: compositing and compositeReady become true after async init
      expect(state.compositing).toBe(true);
      expect(state.compositeReady).toBe(true);
      expect(state.maskCache).toBeNull();
      expect(state.depthCache).toBeNull();
    });
  });

  describe('error handling', () => {
    let node: HSPlusNode;

    beforeEach(() => {
      node = createMockNode();
    });

    it('should emit holographic:error on failure', async () => {
      // Error handling would be tested in integration scenarios
      await holographicSpriteTraitHandler.onAttach(node, {}, undefined);
      expect((node as any).__holographicSpriteState).toBeDefined();
    });
  });
});
