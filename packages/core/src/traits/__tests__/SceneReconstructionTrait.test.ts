/**
 * SceneReconstructionTrait Tests
 *
 * Tests the AR scene mesh reconstruction handler: init, scan lifecycle,
 * mesh received with progress tracking, semantic labeling, update ticks,
 * and detach cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sceneReconstructionHandler } from '../SceneReconstructionTrait';
import type { SceneReconstructionConfig } from '../SceneReconstructionTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'sr-node') {
  return { id } as any;
}

function makeConfig(overrides: Partial<SceneReconstructionConfig> = {}) {
  return { ...sceneReconstructionHandler.defaultConfig, ...overrides };
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
  return ctx.getState().sceneReconstruction;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneReconstructionTrait', () => {
  let node: any;
  let config: SceneReconstructionConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    sceneReconstructionHandler.onAttach!(node, config, ctx as any);
  });

  describe('initialization', () => {
    it('sets initial state with scanning disabled', () => {
      const s = getState(ctx);
      expect(s.isScanning).toBe(false);
      expect(s.meshFaceCount).toBe(0);
      expect(s.scanProgress).toBe(0);
      expect(s.physicsColliderCount).toBe(0);
      expect(s.lastUpdateTime).toBe(0);
    });

    it('emits reconstruction:init with configured mode', () => {
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:init', { mode: 'realtime' });
    });

    it('uses custom mode when configured', () => {
      const c = makeContext();
      const cfg = makeConfig({ reconstruction_mode: 'high_fidelity' });
      sceneReconstructionHandler.onAttach!(node, cfg, c as any);
      expect(c.emit).toHaveBeenCalledWith('reconstruction:init', { mode: 'high_fidelity' });
    });

    it('has correct default config values', () => {
      const d = sceneReconstructionHandler.defaultConfig;
      expect(d.reconstruction_mode).toBe('realtime');
      expect(d.mesh_detail).toBe('medium');
      expect(d.semantic_labeling).toBe(true);
      expect(d.physics_collision).toBe(true);
      expect(d.occlusion_enabled).toBe(true);
      expect(d.update_interval_ms).toBe(100);
      expect(d.max_mesh_faces).toBe(50000);
    });
  });

  describe('scan lifecycle', () => {
    it('reconstruction:started enables scanning', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      expect(getState(ctx).isScanning).toBe(true);
      expect(getState(ctx).scanProgress).toBe(0);
    });

    it('reconstruction:complete disables scanning and sets progress to 1', () => {
      // Start scanning
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      // Complete
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:complete' });

      const s = getState(ctx);
      expect(s.isScanning).toBe(false);
      expect(s.scanProgress).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:complete', expect.objectContaining({ faceCount: 0 }));
    });
  });

  describe('mesh received events', () => {
    it('updates face count from payload', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, {
        type: 'reconstruction:mesh_received',
        payload: { faceCount: 25000 },
      });

      const s = getState(ctx);
      expect(s.meshFaceCount).toBe(25000);
      expect(s.scanProgress).toBe(25000 / 50000); // 0.5
    });

    it('clamps progress to 1.0 max', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, {
        type: 'reconstruction:mesh_received',
        payload: { faceCount: 100000 }, // exceeds max_mesh_faces
      });

      expect(getState(ctx).scanProgress).toBe(1);
    });

    it('applies semantic labels when enabled', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, {
        type: 'reconstruction:mesh_received',
        payload: {
          faceCount: 1000,
          labels: { 'mesh-1': 'floor', 'mesh-2': 'wall' },
        },
      });

      const labels = getState(ctx).semanticLabels;
      expect(labels.get('mesh-1')).toBe('floor');
      expect(labels.get('mesh-2')).toBe('wall');
    });

    it('skips semantic labels when disabled', () => {
      const cfg = makeConfig({ semantic_labeling: false });
      const c = makeContext();
      sceneReconstructionHandler.onAttach!(node, cfg, c as any);
      sceneReconstructionHandler.onEvent!(node, cfg, c as any, { type: 'reconstruction:started' });
      sceneReconstructionHandler.onEvent!(node, cfg, c as any, {
        type: 'reconstruction:mesh_received',
        payload: {
          faceCount: 500,
          labels: { 'mesh-1': 'floor' },
        },
      });

      expect(getState(c).semanticLabels.size).toBe(0);
    });
  });

  describe('onUpdate', () => {
    it('does nothing when not scanning', () => {
      sceneReconstructionHandler.onUpdate!(node, config, ctx as any, 0.05);
      // No mesh_update event should be emitted when not scanning
      expect(ctx.emit).not.toHaveBeenCalledWith('reconstruction:mesh_update', expect.anything());
    });

    it('emits mesh_update when scanning and interval elapsed', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      ctx.emit.mockClear();

      // update_interval_ms is 100ms, so we need delta >= 0.1s
      sceneReconstructionHandler.onUpdate!(node, config, ctx as any, 0.11);

      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:mesh_update', {
        faceCount: 0,
        progress: 0,
      });
    });

    it('accumulates time across multiple updates', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx as any, { type: 'reconstruction:started' });
      ctx.emit.mockClear();

      // Two updates that individually are below threshold but together exceed it
      sceneReconstructionHandler.onUpdate!(node, config, ctx as any, 0.06);
      expect(ctx.emit).not.toHaveBeenCalledWith('reconstruction:mesh_update', expect.anything());

      sceneReconstructionHandler.onUpdate!(node, config, ctx as any, 0.06);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:mesh_update', expect.anything());
    });
  });

  describe('onDetach', () => {
    it('emits reconstruction:stop', () => {
      sceneReconstructionHandler.onDetach!(node, config, ctx as any);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:stop');
    });
  });
});
