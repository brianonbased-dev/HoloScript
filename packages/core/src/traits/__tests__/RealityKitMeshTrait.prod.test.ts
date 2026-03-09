/**
 * RealityKitMeshTrait Production Tests
 *
 * Apple RealityKit mesh: init, anchor add/remove, classification counting,
 * onUpdate tick rate limiting, and detach cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { realityKitMeshHandler } from '../RealityKitMeshTrait';

function makeNode(id = 'rk-node') {
  return { id } as any;
}
function makeConfig(o: any = {}) {
  return { ...realityKitMeshHandler.defaultConfig, ...o };
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

describe('RealityKitMeshTrait — Production', () => {
  let node: any, config: any, ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    realityKitMeshHandler.onAttach(node, config, ctx);
  });

  describe('construction', () => {
    it('initializes inactive state', () => {
      const s = getState(ctx);
      expect(s.isActive).toBe(false);
      expect(s.anchors.size).toBe(0);
      expect(s.totalVertices).toBe(0);
    });

    it('emits rkMesh:init with config', () => {
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:init', { classification: true, physics: true });
    });

    it('has correct defaults', () => {
      const d = realityKitMeshHandler.defaultConfig;
      expect(d.collision_margin).toBe(0.02);
      expect(d.update_frequency).toBe(10);
      expect(d.max_anchor_distance).toBe(8.0);
    });
  });

  describe('anchor lifecycle', () => {
    it('adds anchor and updates counts', () => {
      ctx.emit.mockClear();
      realityKitMeshHandler.onEvent!(node, config, ctx, {
        type: 'rkMesh:anchor_added',
        payload: {
          id: 'a1',
          classification: 'floor',
          vertexCount: 100,
          faceCount: 50,
          boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        },
      });

      const s = getState(ctx);
      expect(s.anchors.has('a1')).toBe(true);
      expect(s.totalVertices).toBe(100);
      expect(s.totalFaces).toBe(50);
      expect(s.classificationCounts.floor).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:anchor_added', {
        id: 'a1',
        classification: 'floor',
      });
    });

    it('removes anchor and decrements counts', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx, {
        type: 'rkMesh:anchor_added',
        payload: {
          id: 'a1',
          classification: 'wall',
          vertexCount: 200,
          faceCount: 100,
          boundingBox: { min: [0, 0, 0], max: [2, 2, 2] },
        },
      });

      realityKitMeshHandler.onEvent!(node, config, ctx, {
        type: 'rkMesh:anchor_removed',
        payload: { id: 'a1' },
      });

      const s = getState(ctx);
      expect(s.anchors.has('a1')).toBe(false);
      expect(s.totalVertices).toBe(0);
      expect(s.totalFaces).toBe(0);
    });

    it('ignores remove for unknown anchor', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx, {
        type: 'rkMesh:anchor_removed',
        payload: { id: 'nonexistent' },
      });
      expect(getState(ctx).totalVertices).toBe(0);
    });

    it('skips classification when disabled', () => {
      const cfg = makeConfig({ mesh_classification: false });
      const c = makeContext();
      realityKitMeshHandler.onAttach(node, cfg, c);

      realityKitMeshHandler.onEvent!(node, cfg, c, {
        type: 'rkMesh:anchor_added',
        payload: {
          id: 'a1',
          classification: 'table',
          vertexCount: 50,
          faceCount: 25,
          boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        },
      });

      expect(getState(c).classificationCounts.table).toBeUndefined();
    });
  });

  describe('onUpdate', () => {
    it('emits tick when active and interval exceeded', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx, { type: 'rkMesh:started' });
      ctx.emit.mockClear();

      // update_frequency=10 → interval=0.1s, pass delta=0.15
      realityKitMeshHandler.onUpdate!(node, config, ctx, 0.15);

      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:tick', { anchorCount: 0, totalFaces: 0 });
    });

    it('skips tick when inactive', () => {
      ctx.emit.mockClear();
      realityKitMeshHandler.onUpdate!(node, config, ctx, 1.0);
      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });

  describe('detach', () => {
    it('clears anchors and emits cleanup', () => {
      realityKitMeshHandler.onEvent!(node, config, ctx, {
        type: 'rkMesh:anchor_added',
        payload: {
          id: 'a1',
          classification: 'none',
          vertexCount: 10,
          faceCount: 5,
          boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        },
      });
      ctx.emit.mockClear();

      realityKitMeshHandler.onDetach!(node, config, ctx);
      expect(getState(ctx).anchors.size).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith('rkMesh:cleanup');
    });
  });
});
