/**
 * AR Traits Production Tests
 *
 * ObjectTrackingTrait + SceneReconstructionTrait + RealityKitMeshTrait
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { objectTrackingHandler } from '../ObjectTrackingTrait';
import { sceneReconstructionHandler } from '../SceneReconstructionTrait';
import { realityKitMeshHandler } from '../RealityKitMeshTrait';

function mockContext() {
  const stateStore: Record<string, any> = {};
  return {
    setState: (s: any) => Object.assign(stateStore, s),
    getState: () => stateStore,
    emit: vi.fn(),
    player: null as any,
  } as any;
}

const mockNode = { id: 'test-node' } as any;

// ─── ObjectTracking ──────────────────────────────────────────────────────────

describe('ObjectTrackingTrait — Production', () => {
  const handler = objectTrackingHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets idle state', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().objectTracking.isTracking).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('tracking:init', expect.any(Object));
  });

  it('tracking:acquired activates tracking', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'tracking:acquired', payload: { anchorId: 'a1' } });
    const s = ctx.getState().objectTracking;
    expect(s.isTracking).toBe(true);
    expect(s.anchorId).toBe('a1');
    expect(s.trackingConfidence).toBe(1.0);
  });

  it('tracking:lost deactivates', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'tracking:acquired', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'tracking:lost', payload: {} });
    const s = ctx.getState().objectTracking;
    expect(s.isTracking).toBe(false);
    expect(s.trackingLost).toBe(true);
    expect(s.trackingConfidence).toBe(0);
  });

  it('onUpdate accumulates tracking time', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'tracking:acquired', payload: {} });
    handler.onUpdate!(mockNode, config, ctx, 0.016);
    handler.onUpdate!(mockNode, config, ctx, 0.016);
    expect(ctx.getState().objectTracking.totalTrackingTime).toBeCloseTo(0.032, 3);
  });

  it('auto_recover on lost triggers recovery attempts', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'tracking:lost', payload: {} });
    handler.onUpdate!(mockNode, config, ctx, 0.016);
    expect(ctx.getState().objectTracking.recoveryAttempts).toBe(1);
  });

  it('onDetach emits anchor_removed if anchor exists', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'tracking:acquired', payload: { anchorId: 'a1' } });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('tracking:anchor_removed', { anchorId: 'a1' });
  });
});

// ─── SceneReconstruction ─────────────────────────────────────────────────────

describe('SceneReconstructionTrait — Production', () => {
  const handler = sceneReconstructionHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets initial state', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().sceneReconstruction.isScanning).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('reconstruction:init', { mode: 'realtime' });
  });

  it('started event begins scanning', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'reconstruction:started', payload: {} });
    expect(ctx.getState().sceneReconstruction.isScanning).toBe(true);
  });

  it('mesh_received updates face count and progress', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'reconstruction:started', payload: {} });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'reconstruction:mesh_received',
      payload: { faceCount: 10000 },
    });
    const s = ctx.getState().sceneReconstruction;
    expect(s.meshFaceCount).toBe(10000);
    expect(s.scanProgress).toBeCloseTo(10000 / 50000, 3);
  });

  it('mesh_received with semantic labels', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'reconstruction:mesh_received',
      payload: { faceCount: 500, labels: { seg1: 'floor', seg2: 'wall' } },
    });
    expect(ctx.getState().sceneReconstruction.semanticLabels.get('seg1')).toBe('floor');
  });

  it('complete event stops scanning', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'reconstruction:started', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'reconstruction:complete', payload: {} });
    expect(ctx.getState().sceneReconstruction.isScanning).toBe(false);
    expect(ctx.getState().sceneReconstruction.scanProgress).toBe(1);
  });

  it('onUpdate emits mesh_update at interval', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'reconstruction:started', payload: {} });
    handler.onUpdate!(mockNode, config, ctx, 0.2); // 200ms >= 100ms config
    expect(ctx.emit).toHaveBeenCalledWith('reconstruction:mesh_update', expect.any(Object));
  });

  it('onDetach emits stop', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('reconstruction:stop');
  });
});

// ─── RealityKitMesh ──────────────────────────────────────────────────────────

describe('RealityKitMeshTrait — Production', () => {
  const handler = realityKitMeshHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets empty state', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().realityKitMesh.isActive).toBe(false);
    expect(ctx.getState().realityKitMesh.anchors.size).toBe(0);
  });

  it('started activates', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'rkMesh:started', payload: {} });
    expect(ctx.getState().realityKitMesh.isActive).toBe(true);
  });

  it('anchor_added accumulates vertices', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'rkMesh:anchor_added',
      payload: { id: 'm1', classification: 'wall', vertexCount: 100, faceCount: 50, boundingBox: { min: [0,0,0], max: [1,1,1] } },
    });
    expect(ctx.getState().realityKitMesh.totalVertices).toBe(100);
    expect(ctx.getState().realityKitMesh.classificationCounts.wall).toBe(1);
  });

  it('anchor_removed subtracts counts', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'rkMesh:anchor_added',
      payload: { id: 'm1', classification: 'floor', vertexCount: 200, faceCount: 80, boundingBox: { min: [0,0,0], max: [1,1,1] } },
    });
    handler.onEvent!(mockNode, config, ctx, { type: 'rkMesh:anchor_removed', payload: { id: 'm1' } });
    expect(ctx.getState().realityKitMesh.totalVertices).toBe(0);
    expect(ctx.getState().realityKitMesh.anchors.size).toBe(0);
  });

  it('onUpdate emits tick at frequency', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'rkMesh:started', payload: {} });
    handler.onUpdate!(mockNode, config, ctx, 0.15); // > 1/10 = 0.1
    expect(ctx.emit).toHaveBeenCalledWith('rkMesh:tick', expect.any(Object));
  });

  it('onDetach clears anchors', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'rkMesh:anchor_added',
      payload: { id: 'm1', classification: 'none', vertexCount: 50, faceCount: 20, boundingBox: { min: [0,0,0], max: [1,1,1] } },
    });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.getState().realityKitMesh.anchors.size).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('rkMesh:cleanup');
  });
});
