/**
 * RealityKitMeshTrait Tests
 *
 * Tests the Apple RealityKit mesh anchor handler: init, activation,
 * anchor add/remove, classification counting, update ticks, and detach cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { realityKitMeshHandler } from '../RealityKitMeshTrait';
import type { RealityKitMeshConfig } from '../RealityKitMeshTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'rk-node') {
  return { id } as any;
}

function makeConfig(overrides: Partial<RealityKitMeshConfig> = {}) {
  return { ...realityKitMeshHandler.defaultConfig, ...overrides };
}

function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}

function getState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().realityKitMesh;
}

function makeAnchor(
  id: string,
  classification = 'wall' as const,
  vertexCount = 100,
  faceCount = 50
) {
  return {
    id,
    classification,
    vertexCount,
    faceCount,
    boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RealityKitMeshTrait', () => {
  let node: any;
  let config: RealityKitMeshConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    realityKitMeshHandler.onAttach!(node, config, ctx as any);
  });

  describe('initialization', () => {
    it('sets initial inactive state', () => {
      const s = getState(ctx);
      expect(s.isActive).toBe(false);
      expect(s.anchors.size).toBe(0);
      expect(s.totalVertices).toBe(0);
      expect(s.totalFaces).toBe(0);
      expect(s.lastUpdateTime).toBe(0);
    });

    it('emits rkMesh:init with config', () => {
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:init', {
        classification: true,
        physics: true,
      });
    });

    it('has correct default config values', () => {
      const d = realityKitMeshHandler.defaultConfig;
      expect(d.mesh_classification).toBe(true);
      expect(d.physics_enabled).toBe(true);
      expect(d.occlusion_enabled).toBe(true);
      expect(d.collision_margin).toBe(0.02);
      expect(d.update_frequency).toBe(10);
      expect(d.max_anchor_distance).toBe(8.0);
      expect(d.render_wireframe).toBe(false);
    });
  });

  describe('activation', () => {
    it('rkMesh:started enables active state', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      expect(getState(ctx).isActive).toBe(true);
    });
  });

  describe('anchor management', () => {
    it('rkMesh:anchor_added stores anchor and updates totals', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a1', 'floor', 200, 100),
      });

      const s = getState(ctx);
      expect(s.anchors.size).toBe(1);
      expect(s.totalVertices).toBe(200);
      expect(s.totalFaces).toBe(100);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:anchor_added', {
        id: 'a1',
        classification: 'floor',
      });
    });

    it('tracks classification counts when classification enabled', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a1', 'wall'),
      });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a2', 'wall'),
      });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a3', 'floor'),
      });

      const counts = getState(ctx).classificationCounts;
      expect(counts.wall).toBe(2);
      expect(counts.floor).toBe(1);
    });

    it('does not count "none" classification', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a1', 'none'),
      });

      expect(getState(ctx).classificationCounts.none).toBeUndefined();
    });

    it('rkMesh:anchor_removed removes anchor and decrements totals', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a1', 'wall', 200, 100),
      });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_removed',
        payload: { id: 'a1' },
      });

      const s = getState(ctx);
      expect(s.anchors.size).toBe(0);
      expect(s.totalVertices).toBe(0);
      expect(s.totalFaces).toBe(0);
    });

    it('removing non-existent anchor does nothing', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_removed',
        payload: { id: 'nonexistent' },
      });

      expect(getState(ctx).totalVertices).toBe(0);
    });
  });

  describe('onUpdate', () => {
    it('does nothing when not active', () => {
      realityKitMeshHandler.onUpdate!(node, config, ctx as any, 0.2);
      expect(ctx.emit).not.toHaveBeenCalledWith('rkMesh:tick', expect.anything());
    });

    it('emits rkMesh:tick when active and interval elapsed', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      ctx.emit.mockClear();

      // update_frequency is 10Hz => interval 0.1s
      realityKitMeshHandler.onUpdate!(node, config, ctx as any, 0.11);

      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:tick', {
        anchorCount: 0,
        totalFaces: 0,
      });
    });

    it('accumulates time until threshold reached', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      ctx.emit.mockClear();

      realityKitMeshHandler.onUpdate!(node, config, ctx as any, 0.05);
      expect(ctx.emit).not.toHaveBeenCalledWith('rkMesh:tick', expect.anything());

      realityKitMeshHandler.onUpdate!(node, config, ctx as any, 0.06);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:tick', expect.anything());
    });
  });

  describe('onDetach', () => {
    it('clears anchors and emits rkMesh:cleanup', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx as any, { type: 'rkMesh:started' });
      realityKitMeshHandler.onEvent!(node, config, ctx as any, {
        type: 'rkMesh:anchor_added',
        payload: makeAnchor('a1'),
      });

      realityKitMeshHandler.onDetach!(node, config, ctx as any);

      const s = getState(ctx);
      expect(s.anchors.size).toBe(0);
      expect(s.isActive).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:cleanup');
    });
  });
});
