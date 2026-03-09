/**
 * HandMeshAITrait Production Tests
 *
 * AI-powered hand mesh reconstruction from skeletal tracking data.
 * Tests extend HandTracking lifecycle with per-node mesh state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handMeshAIHandler } from '../HandMeshAITrait';
import type { HandMeshAIConfig } from '../HandMeshAITrait';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(): any {
  return { name: 'testNode' };
}

function makeCtx() {
  const emit = vi.fn();
  return { emit };
}

function makeConfig(overrides: Partial<HandMeshAIConfig> = {}): HandMeshAIConfig {
  return {
    // HandTracking base
    tracking_backend: 'webxr' as any,
    hand: 'both',
    joint_count: 21,
    gesture_enabled: false,
    confidence_threshold: 0.7,
    // HandMeshAI specific
    hand_model: 'mediapipe_hands',
    bimanual_tracking: false,
    mesh_resolution: 'medium',
    texture_enabled: false,
    vertex_count: 256,
    real_time_generation: true,
    gesture_detection: false,
    inference_fps: 30,
    temporal_smoothing: 0.3,
    ...overrides,
  } as HandMeshAIConfig;
}

function attach(overrides: Partial<HandMeshAIConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(overrides);
  handMeshAIHandler.onAttach!(node, config, ctx as any);
  return { node, ctx, config };
}

function meshState(node: any) {
  return (node as any).__handMeshState;
}

function trackingState(node: any) {
  return (node as any).__handTrackingState;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HandMeshAITrait — Production', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── defaultConfig ──────────────────────────────────────────────────

  it('has name hand_mesh_ai', () => {
    expect(handMeshAIHandler.name).toBe('hand_mesh_ai');
  });

  it('defaultConfig has mesh_resolution medium', () => {
    expect(handMeshAIHandler.defaultConfig.mesh_resolution).toBe('medium');
  });

  it('defaultConfig has 21 joints', () => {
    expect(handMeshAIHandler.defaultConfig.joint_count).toBe(21);
  });

  it('defaultConfig texture_enabled is false', () => {
    expect(handMeshAIHandler.defaultConfig.texture_enabled).toBe(false);
  });

  it('defaultConfig real_time_generation is true', () => {
    expect(handMeshAIHandler.defaultConfig.real_time_generation).toBe(true);
  });

  it('defaultConfig inference_fps is 30', () => {
    expect(handMeshAIHandler.defaultConfig.inference_fps).toBe(30);
  });

  // ─── onAttach ───────────────────────────────────────────────────────

  it('creates __handMeshState on attach', () => {
    const { node } = attach();
    expect(meshState(node)).toBeDefined();
  });

  it('mesh state starts with null meshes and is_generating=false', () => {
    const { node } = attach();
    const ms = meshState(node);
    expect(ms.left_mesh).toBeNull();
    expect(ms.right_mesh).toBeNull();
    expect(ms.is_generating).toBe(false);
  });

  it('emits hand_mesh_ai_init on attach', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith(
      'hand_mesh_ai_init',
      expect.objectContaining({
        meshResolution: 'medium',
        textureEnabled: false,
      })
    );
  });

  it('also initializes base HandTracking state on attach', () => {
    const { node } = attach();
    // HandTrackingHandler.onAttach sets __handTrackingState
    expect(trackingState(node)).toBeDefined();
  });

  // ─── onDetach ───────────────────────────────────────────────────────

  it('removes __handMeshState on detach', () => {
    const { node, ctx, config } = attach();
    handMeshAIHandler.onDetach!(node, config, ctx as any);
    expect(meshState(node)).toBeUndefined();
  });

  it('detach is safe without prior attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    expect(() => handMeshAIHandler.onDetach!(node, makeConfig(), ctx as any)).not.toThrow();
  });

  // ─── onUpdate ───────────────────────────────────────────────────────

  it('onUpdate does nothing when no mesh state', () => {
    const node = makeNode();
    const ctx = makeCtx();
    expect(() => handMeshAIHandler.onUpdate!(node, makeConfig(), ctx as any, 16)).not.toThrow();
  });

  it('onUpdate does nothing when real_time_generation is false', () => {
    const { node, ctx, config } = attach({ real_time_generation: false });
    ctx.emit.mockClear();
    const ts = trackingState(node);
    if (ts) {
      ts.left = { visible: true, joints: {} };
      ts.right = { visible: false, joints: {} };
    }
    handMeshAIHandler.onUpdate!(node, config, ctx as any, 16);
    expect(ctx.emit).not.toHaveBeenCalledWith('hand_mesh_generate', expect.anything());
  });

  it('onUpdate emits hand_mesh_generate for visible left hand', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    const ts = trackingState(node);
    if (ts) {
      ts.left = { visible: true, joints: { wrist: { position: [0, 0, 0] } } };
      ts.right = { visible: false, joints: {} };
      meshState(node).last_update_time = 0; // force update
    }
    handMeshAIHandler.onUpdate!(node, config, ctx as any, 16);
    if (ts) {
      expect(ctx.emit).toHaveBeenCalledWith(
        'hand_mesh_generate',
        expect.objectContaining({
          hand: 'left',
          resolution: 'medium',
        })
      );
    }
  });

  it('onUpdate emits hand_mesh_generate for visible right hand', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    const ts = trackingState(node);
    if (ts) {
      ts.right = { visible: true, joints: { wrist: { position: [0, 0, 0] } } };
      ts.left = { visible: false, joints: {} };
      meshState(node).last_update_time = 0;
    }
    handMeshAIHandler.onUpdate!(node, config, ctx as any, 16);
    if (ts) {
      expect(ctx.emit).toHaveBeenCalledWith(
        'hand_mesh_generate',
        expect.objectContaining({
          hand: 'right',
        })
      );
    }
  });

  // ─── onEvent: hand_mesh_result ──────────────────────────────────────

  it('hand_mesh_result for left sets left_mesh', () => {
    const { node, ctx, config } = attach();
    const mesh = {
      vertices: new Float32Array(6),
      normals: new Float32Array(6),
      indices: new Uint16Array(3),
    };
    handMeshAIHandler.onEvent!(node, config, ctx as any, {
      type: 'hand_mesh_result',
      hand: 'left',
      mesh,
    });
    expect(meshState(node).left_mesh).toBe(mesh);
    expect(meshState(node).is_generating).toBe(false);
  });

  it('hand_mesh_result for right sets right_mesh', () => {
    const { node, ctx, config } = attach();
    const mesh = {
      vertices: new Float32Array(9),
      normals: new Float32Array(9),
      indices: new Uint16Array(6),
    };
    handMeshAIHandler.onEvent!(node, config, ctx as any, {
      type: 'hand_mesh_result',
      hand: 'right',
      mesh,
    });
    expect(meshState(node).right_mesh).toBe(mesh);
  });

  it('hand_mesh_result emits on_hand_mesh_updated with vertexCount', () => {
    const { node, ctx, config } = attach();
    const verts = new Float32Array(9); // 3 vertices
    const mesh = { vertices: verts, normals: new Float32Array(9), indices: new Uint16Array(3) };
    ctx.emit.mockClear();
    handMeshAIHandler.onEvent!(node, config, ctx as any, {
      type: 'hand_mesh_result',
      hand: 'left',
      mesh,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_hand_mesh_updated',
      expect.objectContaining({
        hand: 'left',
        vertexCount: 3,
      })
    );
  });

  it('unknown event type does not crash', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      handMeshAIHandler.onEvent!(node, config, ctx as any, {
        type: 'totally_unknown',
      })
    ).not.toThrow();
  });

  // ─── Config variations ──────────────────────────────────────────────

  it('all hand_model enum values are accepted', () => {
    const models = ['mediapipe_hands', 'frankmocap', 'mano', 'handoccnet'];
    for (const model of models) {
      const cfg = makeConfig({ hand_model: model as any });
      expect(cfg.hand_model).toBe(model);
    }
  });

  it('all mesh_resolution values are accepted', () => {
    const resolutions = ['low', 'medium', 'high', 'ultra'];
    for (const r of resolutions) {
      const cfg = makeConfig({ mesh_resolution: r as any });
      expect(cfg.mesh_resolution).toBe(r);
    }
  });

  it('bimanual_tracking enabled does not crash attach', () => {
    expect(() => attach({ bimanual_tracking: true })).not.toThrow();
  });
});
