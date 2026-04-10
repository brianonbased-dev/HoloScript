/**
 * SceneReconstructionTrait Production Tests
 *
 * AR scene mesh reconstruction: init, scan lifecycle, mesh_received
 * with progress and semantic labels, onUpdate tick, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sceneReconstructionHandler } from '../SceneReconstructionTrait';

function makeNode(id = 'sr-node') {
  return { id } as any;
}
function makeConfig(o: any = {}) {
  return { ...sceneReconstructionHandler.defaultConfig, ...o };
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

describe('SceneReconstructionTrait — Production', () => {
  let node: any, config: any, ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    sceneReconstructionHandler.onAttach(node, config, ctx);
  });

  describe('construction', () => {
    it('initializes idle state', () => {
      const s = getState(ctx);
      expect(s.isScanning).toBe(false);
      expect(s.meshFaceCount).toBe(0);
      expect(s.scanProgress).toBe(0);
      expect(s.semanticLabels.size).toBe(0);
    });

    it('emits reconstruction:init', () => {
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:init', { mode: 'realtime' });
    });

    it('has correct defaults', () => {
      const d = sceneReconstructionHandler.defaultConfig;
      expect(d.mesh_detail).toBe('medium');
      expect(d.max_mesh_faces).toBe(50000);
      expect(d.semantic_labeling).toBe(true);
    });
  });

  describe('scan lifecycle', () => {
    it('starts scanning', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx, { type: 'reconstruction:started' });
      expect(getState(ctx).isScanning).toBe(true);
      expect(getState(ctx).scanProgress).toBe(0);
    });

    it('receives mesh and calculates progress', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx, { type: 'reconstruction:started' });
      sceneReconstructionHandler.onEvent!(node, config, ctx, {
        type: 'reconstruction:mesh_received',
        payload: { faceCount: 25000 },
      });

      const s = getState(ctx);
      expect(s.meshFaceCount).toBe(25000);
      expect(s.scanProgress).toBe(0.5); // 25000/50000
    });

    it('stores semantic labels when enabled', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx, {
        type: 'reconstruction:mesh_received',
        payload: { faceCount: 100, labels: { mesh_1: 'floor', mesh_2: 'wall' } },
      });

      expect(getState(ctx).semanticLabels.get('mesh_1')).toBe('floor');
      expect(getState(ctx).semanticLabels.get('mesh_2')).toBe('wall');
    });

    it('skips labels when semantic_labeling disabled', () => {
      const cfg = makeConfig({ semantic_labeling: false });
      const c = makeContext();
      sceneReconstructionHandler.onAttach(node, cfg, c);

      sceneReconstructionHandler.onEvent!(node, cfg, c, {
        type: 'reconstruction:mesh_received',
        payload: { faceCount: 100, labels: { mesh_1: 'floor' } },
      });

      expect(getState(c).semanticLabels.size).toBe(0);
    });

    it('completes scan', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx, { type: 'reconstruction:started' });
      getState(ctx).meshFaceCount = 48000;
      ctx.emit.mockClear();

      sceneReconstructionHandler.onEvent!(node, config, ctx, { type: 'reconstruction:complete' });

      expect(getState(ctx).isScanning).toBe(false);
      expect(getState(ctx).scanProgress).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:complete', { faceCount: 48000 });
    });
  });

  describe('onUpdate', () => {
    it('emits mesh_update when scanning and interval exceeded', () => {
      sceneReconstructionHandler.onEvent!(node, config, ctx, { type: 'reconstruction:started' });
      ctx.emit.mockClear();

      // update_interval_ms=100 → 0.1s of delta
      sceneReconstructionHandler.onUpdate!(node, config, ctx, 0.15);

      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:mesh_update', {
        faceCount: 0,
        progress: 0,
      });
    });

    it('skips when not scanning', () => {
      ctx.emit.mockClear();
      sceneReconstructionHandler.onUpdate!(node, config, ctx, 1.0);
      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });

  describe('detach', () => {
    it('emits reconstruction:stop', () => {
      ctx.emit.mockClear();
      sceneReconstructionHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('reconstruction:stop');
    });
  });

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      sceneReconstructionHandler.onEvent!(node, config, noCtx, { type: 'reconstruction:started' });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
