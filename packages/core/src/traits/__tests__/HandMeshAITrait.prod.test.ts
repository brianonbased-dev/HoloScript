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
    tracking_backend: 'webxr',
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

function makeJoint(position: [number, number, number], radius = 0.01) {
  return {
    position,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    radius,
  };
}

function makeSkeleton(xOffset = 0) {
  const joints = new Map<string, ReturnType<typeof makeJoint>>();
  const add = (name: string, position: [number, number, number], radius?: number) => {
    joints.set(name, makeJoint([position[0] + xOffset, position[1], position[2]], radius));
  };

  add('wrist', [0, 0, 0], 0.026);
  add('thumb_metacarpal', [-0.035, 0.02, 0.006], 0.014);
  add('thumb_proximal', [-0.062, 0.045, 0.006], 0.012);
  add('thumb_distal', [-0.087, 0.066, 0.003], 0.01);
  add('thumb_tip', [-0.11, 0.082, 0], 0.008);
  add('index_metacarpal', [-0.026, 0.052, 0], 0.012);
  add('index_proximal', [-0.031, 0.097, 0], 0.01);
  add('index_intermediate', [-0.034, 0.135, 0], 0.0085);
  add('index_distal', [-0.036, 0.17, 0], 0.007);
  add('index_tip', [-0.038, 0.2, 0], 0.006);
  add('middle_metacarpal', [0, 0.058, 0.002], 0.013);
  add('middle_proximal', [0, 0.112, 0.002], 0.0105);
  add('middle_intermediate', [0, 0.156, 0.002], 0.009);
  add('middle_distal', [0, 0.194, 0.001], 0.0075);
  add('middle_tip', [0, 0.228, 0], 0.006);
  add('ring_metacarpal', [0.026, 0.052, 0], 0.012);
  add('ring_proximal', [0.031, 0.1, 0], 0.0105);
  add('ring_intermediate', [0.035, 0.14, 0], 0.0085);
  add('ring_distal', [0.037, 0.174, 0], 0.007);
  add('ring_tip', [0.039, 0.203, 0], 0.006);
  add('pinky_metacarpal', [0.05, 0.043, -0.001], 0.0105);
  add('pinky_proximal', [0.058, 0.082, -0.001], 0.009);
  add('pinky_intermediate', [0.064, 0.113, -0.001], 0.0075);
  add('pinky_distal', [0.067, 0.141, -0.001], 0.0065);
  add('pinky_tip', [0.069, 0.166, -0.001], 0.0055);

  return joints;
}

function setVisibleLeftSkeleton(node: any, joints = makeSkeleton()) {
  const ts = trackingState(node);
  ts.left.visible = true;
  ts.left.joints = joints;
  ts.left.pinchStrength = 0;
  ts.left.gripStrength = 0;
  ts.right.visible = false;
  ts.right.joints = new Map();
  meshState(node).last_update_time = 0;
}

function getVertex(mesh: { vertices: Float32Array }, index: number): [number, number, number] {
  return [mesh.vertices[index * 3], mesh.vertices[index * 3 + 1], mesh.vertices[index * 3 + 2]];
}

function distance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

  it('onUpdate generates deterministic joint-driven mesh from real skeleton data', () => {
    const { node, ctx, config } = attach();
    const joints = makeSkeleton();
    const randomSpy = vi.spyOn(Math, 'random');
    ctx.emit.mockClear();
    setVisibleLeftSkeleton(node, joints);

    try {
      handMeshAIHandler.onUpdate!(node, config, ctx as any, 16);
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }

    const mesh = meshState(node).left_mesh;
    expect(mesh).toBeTruthy();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.vertices.length);
    expect(mesh.indices.length).toBeGreaterThan(0);

    expect(ctx.emit).toHaveBeenCalledWith(
      'hand_mesh_result',
      expect.objectContaining({
        hand: 'left',
        source: 'in_process_skinning',
      })
    );

    const skeletonPositions = [...joints.values()].map((joint) => joint.position);
    const sampleDistances: number[] = [];
    const meshValue = mesh as { vertices: Float32Array };
    for (let index = 0; index < Math.min(mesh.vertices.length / 3, 80); index++) {
      const vertex = getVertex(meshValue, index);
      sampleDistances.push(Math.min(...skeletonPositions.map((joint) => distance(vertex, joint))));
    }
    const meanDistance =
      sampleDistances.reduce((total, value) => total + value, 0) / sampleDistances.length;
    expect(meanDistance).toBeLessThan(0.055);
  });

  it('deforms generated vertices when joint positions move', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    setVisibleLeftSkeleton(node, makeSkeleton(0));
    handMeshAIHandler.onUpdate!(node, config, ctx as any, 16);
    const firstMesh = meshState(node).left_mesh;
    const firstVertex = firstMesh.vertices[0];

    setVisibleLeftSkeleton(node, makeSkeleton(0.05));
    handMeshAIHandler.onUpdate!(node, config, ctx as any, 16);
    const secondMesh = meshState(node).left_mesh;

    expect(secondMesh.vertices[0]).toBeGreaterThan(firstVertex + 0.035);
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
