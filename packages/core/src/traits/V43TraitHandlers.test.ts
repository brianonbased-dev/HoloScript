/**
 * V43 Trait Handler Tests
 *
 * Tests for the 6 new Tier 2/3 trait handlers added in the V43 update:
 *   - objectTrackingHandler
 *   - sceneReconstructionHandler
 *   - spatialNavigationHandler
 *   - embeddingSearchHandler
 *   - realityKitMeshHandler
 *   - volumetricWindowHandler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { objectTrackingHandler } from './ObjectTrackingTrait';
import { sceneReconstructionHandler } from './SceneReconstructionTrait';
import { spatialNavigationHandler } from './SpatialNavigationTrait';
import { embeddingSearchHandler } from './EmbeddingSearchTrait';
import { realityKitMeshHandler } from './RealityKitMeshTrait';
import { volumetricWindowHandler } from './VolumetricWindowTrait';
import type { TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockNode(id = 'test_node'): HSPlusNode {
  return {
    type: 'object',
    id,
    properties: { position: [0, 0, 0], rotation: [0, 0, 0] },
    directives: [],
    children: [],
    traits: new Map(),
  } as HSPlusNode;
}

function createMockContext(playerPos?: { x: number; y: number; z: number }): TraitContext {
  let state: Record<string, unknown> = {};

  return {
    vr: {
      hands: { left: null, right: null },
      headset: { position: [0, 1.6, 0], rotation: { x: 0, y: 0, z: 0 } },
      isPresenting: false,
    } as any,
    physics: {
      addCollider: vi.fn(),
      removeCollider: vi.fn(),
    } as any,
    audio: { play: vi.fn(), stop: vi.fn() } as any,
    haptics: { pulse: vi.fn() } as any,
    player: playerPos ? { position: playerPos } : undefined,
    emit: vi.fn(),
    getState: vi.fn(() => ({ ...state })),
    setState: vi.fn((updates: Record<string, unknown>) => {
      state = { ...state, ...updates };
    }),
    getScaleMultiplier: vi.fn(() => 1),
    setScaleContext: vi.fn(),
  } as any;
}

// =============================================================================
// objectTrackingHandler
// =============================================================================

describe('objectTrackingHandler', () => {
  const handler = objectTrackingHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "object_tracking"', () => {
      expect(handler.name).toBe('object_tracking');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.tracking_target).toBe('objects');
      expect(cfg.anchor_persistence).toBe('session');
      expect(cfg.tracking_quality).toBe('medium');
      expect(cfg.max_distance).toBe(5.0);
      expect(cfg.update_rate_hz).toBe(30);
      expect(cfg.auto_recover).toBe(true);
      expect(cfg.visualization).toBe(false);
    });
  });

  describe('onAttach', () => {
    it('should initialise tracking state and emit tracking:init', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          objectTracking: expect.objectContaining({
            isTracking: false,
            trackingLost: false,
            anchorId: null,
            trackingConfidence: 0,
            recoveryAttempts: 0,
          }),
        })
      );
      expect(ctx.emit).toHaveBeenCalledWith('tracking:init', {
        target: handler.defaultConfig.tracking_target,
      });
    });
  });

  describe('onDetach', () => {
    it('should emit anchor_removed when an anchorId exists', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      // Simulate acquired state with anchorId
      const trackedState = ctx.getState().objectTracking as any;
      trackedState.anchorId = 'anchor-xyz';

      handler.onDetach!(node, handler.defaultConfig, ctx);

      expect(ctx.emit).toHaveBeenCalledWith('tracking:anchor_removed', {
        anchorId: 'anchor-xyz',
      });
    });

    it('should not emit anchor_removed when no anchorId', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onDetach!(node, handler.defaultConfig, ctx);

      const emittedEvents = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedEvents).not.toContain('tracking:anchor_removed');
    });
  });

  describe('onUpdate', () => {
    it('should increment totalTrackingTime when tracking', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().objectTracking as any;
      state.isTracking = true;

      handler.onUpdate!(node, handler.defaultConfig, ctx, 0.016);
      expect(state.totalTrackingTime).toBeCloseTo(0.016);
    });

    it('should emit recovery_attempt when trackingLost and auto_recover enabled', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().objectTracking as any;
      state.trackingLost = true;

      handler.onUpdate!(node, handler.defaultConfig, ctx, 0.016);
      expect(ctx.emit).toHaveBeenCalledWith('tracking:recovery_attempt', { attempt: 1 });
    });

    it('should not emit recovery_attempt when auto_recover is false', () => {
      const cfg = { ...handler.defaultConfig, auto_recover: false };
      handler.onAttach!(node, cfg, ctx);
      const state = ctx.getState().objectTracking as any;
      state.trackingLost = true;

      handler.onUpdate!(node, cfg, ctx, 0.016);
      const emittedEvents = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedEvents).not.toContain('tracking:recovery_attempt');
    });
  });

  describe('onEvent', () => {
    it('tracking:acquired → isTracking=true, trackingLost=false, confidence=1', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'tracking:acquired',
        payload: { anchorId: 'anc-001' },
      } as any);

      const state = ctx.getState().objectTracking as any;
      expect(state.isTracking).toBe(true);
      expect(state.trackingLost).toBe(false);
      expect(state.anchorId).toBe('anc-001');
      expect(state.trackingConfidence).toBe(1.0);
    });

    it('tracking:lost → isTracking=false, trackingLost=true, emits tracking:lost', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'tracking:lost',
      } as any);

      const state = ctx.getState().objectTracking as any;
      expect(state.isTracking).toBe(false);
      expect(state.trackingLost).toBe(true);
      expect(state.trackingConfidence).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith('tracking:lost', {
        target: handler.defaultConfig.tracking_target,
      });
    });
  });
});

// =============================================================================
// sceneReconstructionHandler
// =============================================================================

describe('sceneReconstructionHandler', () => {
  const handler = sceneReconstructionHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "scene_reconstruction"', () => {
      expect(handler.name).toBe('scene_reconstruction');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.reconstruction_mode).toBe('realtime');
      expect(cfg.mesh_detail).toBe('medium');
      expect(cfg.semantic_labeling).toBe(true);
      expect(cfg.physics_collision).toBe(true);
      expect(cfg.update_interval_ms).toBe(100);
      expect(cfg.max_mesh_faces).toBe(50000);
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit reconstruction:init', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneReconstruction: expect.objectContaining({
            isScanning: false,
            meshFaceCount: 0,
            scanProgress: 0,
          }),
        })
      );
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:init', {
        mode: handler.defaultConfig.reconstruction_mode,
      });
    });
  });

  describe('onDetach', () => {
    it('should emit reconstruction:stop', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:stop');
    });
  });

  describe('onUpdate', () => {
    it('should emit mesh_update after update_interval_ms elapses', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().sceneReconstruction as any;
      state.isScanning = true;
      state.meshFaceCount = 1000;

      // 100ms = 0.1s interval; pass 0.15s
      handler.onUpdate!(node, handler.defaultConfig, ctx, 0.15);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:mesh_update', {
        faceCount: 1000,
        progress: expect.any(Number),
      });
    });

    it('should not emit when not scanning', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      // isScanning stays false
      handler.onUpdate!(node, handler.defaultConfig, ctx, 0.5);
      const emittedEvents = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedEvents).not.toContain('reconstruction:mesh_update');
    });
  });

  describe('onEvent', () => {
    it('reconstruction:started → isScanning=true, scanProgress=0', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'reconstruction:started',
      } as any);

      const state = ctx.getState().sceneReconstruction as any;
      expect(state.isScanning).toBe(true);
      expect(state.scanProgress).toBe(0);
    });

    it('reconstruction:mesh_received → updates faceCount and labels', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'reconstruction:mesh_received',
        payload: {
          faceCount: 10000,
          labels: { 'floor-1': 'floor', 'wall-1': 'wall' },
        },
      } as any);

      const state = ctx.getState().sceneReconstruction as any;
      expect(state.meshFaceCount).toBe(10000);
      expect(state.semanticLabels.get('floor-1')).toBe('floor');
      expect(state.semanticLabels.get('wall-1')).toBe('wall');
    });

    it('reconstruction:complete → isScanning=false, emits reconstruction:complete', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().sceneReconstruction as any;
      state.isScanning = true;
      state.meshFaceCount = 25000;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'reconstruction:complete',
      } as any);

      expect(state.isScanning).toBe(false);
      expect(state.scanProgress).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:complete', { faceCount: 25000 });
    });
  });
});

// =============================================================================
// spatialNavigationHandler
// =============================================================================

describe('spatialNavigationHandler', () => {
  const handler = spatialNavigationHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "spatial_navigation"', () => {
      expect(handler.name).toBe('spatial_navigation');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.navigation_mode).toBe('walking');
      expect(cfg.path_visualization).toBe('arrow');
      expect(cfg.show_distance).toBe(true);
      expect(cfg.show_eta).toBe(true);
      expect(cfg.auto_recalculate).toBe(true);
      expect(cfg.waypoint_radius_m).toBe(2.0);
      expect(cfg.path_color).toBe('#00aaff');
    });
  });

  describe('onAttach', () => {
    it('should initialise navigation state', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          spatialNavigation: expect.objectContaining({
            isNavigating: false,
            waypoints: [],
            currentWaypointIndex: 0,
            totalDistance: 0,
          }),
        })
      );
    });
  });

  describe('onDetach', () => {
    it('should emit navigation:cancelled when navigating', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialNavigation as any;
      state.isNavigating = true;

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('navigation:cancelled');
    });

    it('should not emit when not navigating', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onDetach!(node, handler.defaultConfig, ctx);

      const emittedEvents = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedEvents).not.toContain('navigation:cancelled');
    });
  });

  describe('onEvent', () => {
    it('navigation:start → isNavigating=true with waypoints, emits navigation:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'navigation:start',
        payload: {
          waypoints: [
            { id: 'wp1', position: [10, 0, 0] },
            { id: 'wp2', position: [20, 0, 0] },
          ],
          totalDistance: 20,
          estimatedSeconds: 30,
        },
      } as any);

      const state = ctx.getState().spatialNavigation as any;
      expect(state.isNavigating).toBe(true);
      expect(state.waypoints).toHaveLength(2);
      expect(state.totalDistance).toBe(20);
      expect(state.estimatedSeconds).toBe(30);
      expect(ctx.emit).toHaveBeenCalledWith('navigation:started', { waypoints: 2 });
    });

    it('navigation:stop → isNavigating=false, emits navigation:stopped', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialNavigation as any;
      state.isNavigating = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'navigation:stop',
      } as any);

      expect(state.isNavigating).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('navigation:stopped');
    });
  });
});

// =============================================================================
// embeddingSearchHandler
// =============================================================================

describe('embeddingSearchHandler', () => {
  const handler = embeddingSearchHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "embedding_search"', () => {
      expect(handler.name).toBe('embedding_search');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.embedding_model).toBe('all-minilm-l6-v2');
      expect(cfg.similarity_metric).toBe('cosine');
      expect(cfg.top_k).toBe(5);
      expect(cfg.min_score).toBe(0.6);
      expect(cfg.cache_embeddings).toBe(true);
      expect(cfg.max_cache_size).toBe(1000);
      expect(cfg.cross_modal).toBe(false);
    });
  });

  describe('onAttach', () => {
    it('should initialise search state and emit search:ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          embeddingSearch: expect.objectContaining({
            totalQueries: 0,
            cacheHits: 0,
            isSearching: false,
            lastResults: [],
          }),
        })
      );
      expect(ctx.emit).toHaveBeenCalledWith('search:ready', {
        model: handler.defaultConfig.embedding_model,
        metric: handler.defaultConfig.similarity_metric,
      });
    });
  });

  describe('onDetach', () => {
    it('should clear the embedding cache without throwing', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().embeddingSearch as any;
      state.embeddingCache.set('foo', new Float32Array([1, 2, 3]));

      expect(() => handler.onDetach!(node, handler.defaultConfig, ctx)).not.toThrow();
      expect(state.embeddingCache.size).toBe(0);
    });
  });

  describe('onEvent', () => {
    it('search:query → increments totalQueries, isSearching=true, emits search:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'search:query',
        payload: { query: 'red chair near window' },
      } as any);

      const state = ctx.getState().embeddingSearch as any;
      expect(state.totalQueries).toBe(1);
      expect(state.isSearching).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('search:started', {
        query: 'red chair near window',
        model: handler.defaultConfig.embedding_model,
      });
    });

    it('search:query with cached entry → increments cacheHits and emits search:cache_hit', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().embeddingSearch as any;
      state.embeddingCache.set('my query', new Float32Array([0.1, 0.2]));

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'search:query',
        payload: { query: 'my query' },
      } as any);

      expect(state.cacheHits).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('search:cache_hit', { query: 'my query' });
    });

    it('search:results → filters by min_score, clamps to top_k, emits search:complete', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      // Need at least 1 query so totalQueries > 0
      const state = ctx.getState().embeddingSearch as any;
      state.totalQueries = 1;
      state.isSearching = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'search:results',
        payload: {
          results: [
            { id: 'a', score: 0.9, payload: {} },
            { id: 'b', score: 0.5, payload: {} }, // below min_score 0.6 — filtered
            { id: 'c', score: 0.75, payload: {} },
          ],
          queryTimeMs: 50,
        },
      } as any);

      expect(state.isSearching).toBe(false);
      expect(state.lastResults).toHaveLength(2); // only a and c pass min_score
      expect(ctx.emit).toHaveBeenCalledWith('search:complete', {
        resultCount: 2,
        queryTimeMs: 50,
        cacheHitRate: expect.any(Number),
      });
    });
  });
});

// =============================================================================
// realityKitMeshHandler
// =============================================================================

describe('realityKitMeshHandler', () => {
  const handler = realityKitMeshHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "realitykit_mesh"', () => {
      expect(handler.name).toBe('realitykit_mesh');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.mesh_classification).toBe(true);
      expect(cfg.physics_enabled).toBe(true);
      expect(cfg.occlusion_enabled).toBe(true);
      expect(cfg.collision_margin).toBe(0.02);
      expect(cfg.update_frequency).toBe(10);
      expect(cfg.max_anchor_distance).toBe(8.0);
      expect(cfg.render_wireframe).toBe(false);
    });
  });

  describe('onAttach', () => {
    it('should initialise mesh state and emit rkMesh:init', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          realityKitMesh: expect.objectContaining({
            isActive: false,
            totalVertices: 0,
            totalFaces: 0,
          }),
        })
      );
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:init', {
        classification: handler.defaultConfig.mesh_classification,
        physics: handler.defaultConfig.physics_enabled,
      });
    });
  });

  describe('onDetach', () => {
    it('should clear anchors and emit rkMesh:cleanup', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().realityKitMesh as any;
      state.anchors.set('anc-1', { id: 'anc-1', vertexCount: 100, faceCount: 50 });

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(state.anchors.size).toBe(0);
      expect(state.isActive).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:cleanup');
    });
  });

  describe('onUpdate', () => {
    it('should emit rkMesh:tick after update interval elapses', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().realityKitMesh as any;
      state.isActive = true;
      state.totalFaces = 200;

      // update_frequency=10Hz → interval=0.1s; pass 0.2s
      handler.onUpdate!(node, handler.defaultConfig, ctx, 0.2);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:tick', {
        anchorCount: 0,
        totalFaces: 200,
      });
    });

    it('should not emit tick when not active', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onUpdate!(node, handler.defaultConfig, ctx, 0.5);
      const emittedEvents = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedEvents).not.toContain('rkMesh:tick');
    });
  });

  describe('onEvent', () => {
    it('rkMesh:started → isActive=true', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, { type: 'rkMesh:started' } as any);

      const state = ctx.getState().realityKitMesh as any;
      expect(state.isActive).toBe(true);
    });

    it('rkMesh:anchor_added → increments counts, emits rkMesh:anchor_added', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'rkMesh:anchor_added',
        payload: {
          id: 'anc-floor',
          classification: 'floor',
          vertexCount: 500,
          faceCount: 250,
          boundingBox: { min: [0, 0, 0], max: [3, 0.01, 3] },
        },
      } as any);

      const state = ctx.getState().realityKitMesh as any;
      expect(state.anchors.size).toBe(1);
      expect(state.totalVertices).toBe(500);
      expect(state.totalFaces).toBe(250);
      expect(state.classificationCounts['floor']).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:anchor_added', {
        id: 'anc-floor',
        classification: 'floor',
      });
    });

    it('rkMesh:anchor_removed → decrements counts', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'rkMesh:anchor_added',
        payload: {
          id: 'anc-wall',
          classification: 'wall',
          vertexCount: 300,
          faceCount: 150,
          boundingBox: { min: [0, 0, 0], max: [3, 2, 0] },
        },
      } as any);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'rkMesh:anchor_removed',
        payload: { id: 'anc-wall' },
      } as any);

      const state = ctx.getState().realityKitMesh as any;
      expect(state.anchors.size).toBe(0);
      expect(state.totalVertices).toBe(0);
      expect(state.totalFaces).toBe(0);
    });
  });
});

// =============================================================================
// volumetricWindowHandler
// =============================================================================

describe('volumetricWindowHandler', () => {
  const handler = volumetricWindowHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "volumetric_window"', () => {
      expect(handler.name).toBe('volumetric_window');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.window_type).toBe('bounded');
      expect(cfg.scale_mode).toBe('tabletop');
      expect(cfg.immersion_style).toBe('mixed');
      expect(cfg.initial_width).toBe(0.6);
      expect(cfg.initial_height).toBe(0.4);
      expect(cfg.initial_depth).toBe(0.3);
      expect(cfg.resizable).toBe(true);
      expect(cfg.min_scale).toBe(0.1);
      expect(cfg.max_scale).toBe(10.0);
      expect(cfg.ornament_visibility).toBe(true);
    });
  });

  describe('onAttach', () => {
    it('should initialise window state and emit vWindow:init', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          volumetricWindow: expect.objectContaining({
            isOpen: false,
            currentScale: 1.0,
          }),
        })
      );
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:init', {
        type: handler.defaultConfig.window_type,
        scale_mode: handler.defaultConfig.scale_mode,
      });
    });

    it('should set isImmersive=true when window_type is "immersive"', () => {
      const cfg = { ...handler.defaultConfig, window_type: 'immersive' as const };
      handler.onAttach!(node, cfg, ctx);

      const state = ctx.getState().volumetricWindow as any;
      expect(state.isImmersive).toBe(true);
      expect(state.immersionProgress).toBe(1);
    });
  });

  describe('onDetach', () => {
    it('should emit vWindow:closed if the window was open', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().volumetricWindow as any;
      state.isOpen = true;

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
    });

    it('should not emit vWindow:closed when window is not open', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onDetach!(node, handler.defaultConfig, ctx);

      const calls = (ctx.emit as any).mock.calls;
      const closedCalls = calls.filter((c: any[]) => c[0] === 'vWindow:closed');
      expect(closedCalls).toHaveLength(0);
    });
  });

  describe('onEvent', () => {
    it('vWindow:open → isOpen=true, emits vWindow:opened', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'vWindow:open',
        payload: { position: [0, 1.5, -1] },
      } as any);

      const state = ctx.getState().volumetricWindow as any;
      expect(state.isOpen).toBe(true);
      expect(state.placement).toEqual([0, 1.5, -1]);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:opened', {
        type: handler.defaultConfig.window_type,
      });
    });

    it('vWindow:close → isOpen=false, emits vWindow:closed', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().volumetricWindow as any;
      state.isOpen = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, { type: 'vWindow:close' } as any);
      expect(state.isOpen).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
    });

    it('vWindow:resize → updates dimensions, emits vWindow:resized', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'vWindow:resize',
        payload: { width: 1.2, height: 0.8, depth: 0.5 },
      } as any);

      const state = ctx.getState().volumetricWindow as any;
      expect(state.currentWidth).toBe(1.2);
      expect(state.currentHeight).toBe(0.8);
      expect(state.currentDepth).toBe(0.5);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:resized', {
        width: 1.2,
        height: 0.8,
        depth: 0.5,
      });
    });

    it('vWindow:resize → ignored when resizable=false', () => {
      const cfg = { ...handler.defaultConfig, resizable: false };
      handler.onAttach!(node, cfg, ctx);
      handler.onEvent!(node, cfg, ctx, {
        type: 'vWindow:resize',
        payload: { width: 2.0, height: 2.0 },
      } as any);

      const emittedEvents = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedEvents).not.toContain('vWindow:resized');
    });

    it('vWindow:scale → clamps to min_scale/max_scale, emits vWindow:scaled', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      // Try to set scale beyond max (10.0)
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'vWindow:scale',
        payload: { scale: 50 },
      } as any);

      const state = ctx.getState().volumetricWindow as any;
      expect(state.currentScale).toBe(10.0); // clamped
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:scaled', { scale: 10.0 });
    });

    it('vWindow:immersion_change → updates immersionProgress and isImmersive', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'vWindow:immersion_change',
        payload: { progress: 0.75 },
      } as any);

      const state = ctx.getState().volumetricWindow as any;
      expect(state.immersionProgress).toBe(0.75);
      expect(state.isImmersive).toBe(false); // below 1.0
    });
  });

  describe('full lifecycle', () => {
    it('should support attach → open → resize → close → detach', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, { type: 'vWindow:open' } as any);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'vWindow:resize',
        payload: { width: 0.9, height: 0.6 },
      } as any);
      handler.onEvent!(node, handler.defaultConfig, ctx, { type: 'vWindow:close' } as any);
      handler.onDetach!(node, handler.defaultConfig, ctx);

      const emittedTypes = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emittedTypes).toContain('vWindow:init');
      expect(emittedTypes).toContain('vWindow:opened');
      expect(emittedTypes).toContain('vWindow:resized');
      expect(emittedTypes).toContain('vWindow:closed');
    });
  });
});
