/**
 * MeshDetectionTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { meshDetectionHandler } from '../MeshDetectionTrait';

function makeNode() {
  return { id: 'mesh_node' };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...meshDetectionHandler.defaultConfig!, ...config };
  meshDetectionHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

function makeBlock(id: string, vCount = 10, tCount = 5): any {
  return {
    id,
    vertices: new Float32Array(vCount * 3),
    indices: new Uint32Array(tCount * 3),
    normals: new Float32Array(vCount * 3),
    bounds: { min: [0, 0, 0 ], max: [1, 1, 1 ] },
    lastUpdated: 0,
    vertexCount: vCount,
    triangleCount: tCount,
  };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('meshDetectionHandler.defaultConfig', () => {
  it('resolution = medium', () =>
    expect(meshDetectionHandler.defaultConfig!.resolution).toBe('medium'));
  it('semantic_labeling = false', () =>
    expect(meshDetectionHandler.defaultConfig!.semantic_labeling).toBe(false));
  it('update_rate = 10', () => expect(meshDetectionHandler.defaultConfig!.update_rate).toBe(10));
  it('max_distance = 5', () => expect(meshDetectionHandler.defaultConfig!.max_distance).toBe(5));
  it('occlusion_enabled = true', () =>
    expect(meshDetectionHandler.defaultConfig!.occlusion_enabled).toBe(true));
  it('physics_collider = false', () =>
    expect(meshDetectionHandler.defaultConfig!.physics_collider).toBe(false));
  it('visible = false', () => expect(meshDetectionHandler.defaultConfig!.visible).toBe(false));
  it('wireframe = false', () => expect(meshDetectionHandler.defaultConfig!.wireframe).toBe(false));
  it('block_size = 1.0', () => expect(meshDetectionHandler.defaultConfig!.block_size).toBe(1.0));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('meshDetectionHandler.onAttach', () => {
  it('creates __meshDetectionState', () =>
    expect((attachNode().node as any).__meshDetectionState).toBeDefined());
  it('meshBlocks is an empty Map', () =>
    expect((attachNode().node as any).__meshDetectionState.meshBlocks.size).toBe(0));
  it('lastUpdateTime = 0', () =>
    expect((attachNode().node as any).__meshDetectionState.lastUpdateTime).toBe(0));
  it('isScanning = true after attach', () =>
    expect((attachNode().node as any).__meshDetectionState.isScanning).toBe(true));
  it('totalVertices = 0', () =>
    expect((attachNode().node as any).__meshDetectionState.totalVertices).toBe(0));
  it('totalTriangles = 0', () =>
    expect((attachNode().node as any).__meshDetectionState.totalTriangles).toBe(0));
  it('scanProgress = 0', () =>
    expect((attachNode().node as any).__meshDetectionState.scanProgress).toBe(0));
  it('physicsColliderIds = []', () =>
    expect((attachNode().node as any).__meshDetectionState.physicsColliderIds).toEqual([]));
  it('emits mesh_detection_start with resolution, maxDistance, semanticLabeling', () => {
    const { ctx } = attachNode({ resolution: 'high', max_distance: 8, semantic_labeling: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_detection_start',
      expect.objectContaining({
        resolution: 'high',
        maxDistance: 8,
        semanticLabeling: true,
      })
    );
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('meshDetectionHandler.onDetach', () => {
  it('removes __meshDetectionState', () => {
    const { node, cfg, ctx } = attachNode();
    meshDetectionHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__meshDetectionState).toBeUndefined();
  });
  it('emits mesh_detection_stop when isScanning=true', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    meshDetectionHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('mesh_detection_stop', expect.any(Object));
  });
  it('does NOT emit mesh_detection_stop when isScanning=false', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__meshDetectionState.isScanning = false;
    ctx.emit.mockClear();
    meshDetectionHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_detection_stop', expect.any(Object));
  });
  it('emits physics_remove_collider for each stored collider id', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__meshDetectionState.physicsColliderIds = ['col_a', 'col_b'];
    ctx.emit.mockClear();
    meshDetectionHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('physics_remove_collider', { colliderId: 'col_a' });
    expect(ctx.emit).toHaveBeenCalledWith('physics_remove_collider', { colliderId: 'col_b' });
  });
  it('emits mesh_block_remove for each stored block', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('b1');
    (node as any).__meshDetectionState.meshBlocks.set('b1', block);
    ctx.emit.mockClear();
    meshDetectionHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('mesh_block_remove', { blockId: 'b1' });
  });
});

// ─── onUpdate ────────────────────────────────────────────────────────────────

describe('meshDetectionHandler.onUpdate', () => {
  it('emits mesh_request_update when isScanning=true and interval elapsed', () => {
    const { node, cfg, ctx } = attachNode({ update_rate: 10 });
    // lastUpdateTime=0, Date.now() will be >> 100ms (1000/10)
    ctx.emit.mockClear();
    meshDetectionHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_request_update',
      expect.objectContaining({ maxDistance: cfg.max_distance })
    );
  });
  it('does NOT emit when isScanning=false', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__meshDetectionState.isScanning = false;
    ctx.emit.mockClear();
    meshDetectionHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_request_update', expect.any(Object));
  });
  it('does NOT emit again before interval (rate limiting)', () => {
    const { node, cfg, ctx } = attachNode({ update_rate: 10 }); // interval = 100ms
    const now = Date.now();
    (node as any).__meshDetectionState.lastUpdateTime = now + 50; // set future timestamp to simulate "just updated"
    ctx.emit.mockClear();
    meshDetectionHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_request_update', expect.any(Object));
  });
  it('updates lastUpdateTime after emitting', () => {
    const { node, cfg, ctx } = attachNode({ update_rate: 10 });
    const before = Date.now();
    meshDetectionHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__meshDetectionState.lastUpdateTime).toBeGreaterThanOrEqual(before);
  });
});

// ─── onEvent — mesh_block_update (new block) ─────────────────────────────────

describe('meshDetectionHandler.onEvent — mesh_block_update (new)', () => {
  it('stores block in meshBlocks map', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('block_1', 100, 50);
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect((node as any).__meshDetectionState.meshBlocks.has('block_1')).toBe(true);
  });
  it('increments totalVertices', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('b1', 100, 50);
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect((node as any).__meshDetectionState.totalVertices).toBe(100);
  });
  it('increments totalTriangles', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('b1', 100, 50);
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect((node as any).__meshDetectionState.totalTriangles).toBe(50);
  });
  it('emits mesh_block_created for new block', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('new_b');
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_created',
      expect.objectContaining({ blockId: 'new_b' })
    );
  });
  it('emits mesh_block_render when visible=true', () => {
    const { node, cfg, ctx } = attachNode({ visible: true, wireframe: true });
    const block = makeBlock('vb');
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_render',
      expect.objectContaining({ blockId: 'vb', wireframe: true })
    );
  });
  it('does NOT emit mesh_block_render when visible=false', () => {
    const { node, cfg, ctx } = attachNode({ visible: false });
    const block = makeBlock('hb');
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_block_render', expect.any(Object));
  });
  it('emits mesh_occlusion_update when occlusion_enabled=true', () => {
    const { node, cfg, ctx } = attachNode({ occlusion_enabled: true });
    const block = makeBlock('ob');
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_occlusion_update',
      expect.objectContaining({ blockId: 'ob' })
    );
  });
  it('does NOT emit mesh_occlusion_update when occlusion_enabled=false', () => {
    const { node, cfg, ctx } = attachNode({ occlusion_enabled: false });
    const block = makeBlock('nb');
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_occlusion_update', expect.any(Object));
  });
  it('emits physics_add_mesh_collider when physics_collider=true', () => {
    const { node, cfg, ctx } = attachNode({ physics_collider: true });
    const block = makeBlock('pb');
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_mesh_collider',
      expect.objectContaining({ colliderId: 'mesh_collider_pb', isStatic: true })
    );
  });
  it('adds colliderId to physicsColliderIds when physics_collider=true', () => {
    const { node, cfg, ctx } = attachNode({ physics_collider: true });
    const block = makeBlock('pb');
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect((node as any).__meshDetectionState.physicsColliderIds).toContain('mesh_collider_pb');
  });
  it('does NOT duplicate colliderId on re-update of same block', () => {
    const { node, cfg, ctx } = attachNode({ physics_collider: true });
    const block = makeBlock('pb', 10, 5);
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    const ids = (node as any).__meshDetectionState.physicsColliderIds;
    expect(ids.filter((id: string) => id === 'mesh_collider_pb')).toHaveLength(1);
  });
});

// ─── onEvent — mesh_block_update (updated block) ─────────────────────────────

describe('meshDetectionHandler.onEvent — mesh_block_update (updated)', () => {
  it('subtracts old vertex/triangle counts before adding new ones', () => {
    const { node, cfg, ctx } = attachNode();
    const block1 = makeBlock('b1', 100, 50);
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block: block1 });
    const block2 = { ...makeBlock('b1', 200, 100) }; // same id, bigger
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block: block2 });
    expect((node as any).__meshDetectionState.totalVertices).toBe(200);
    expect((node as any).__meshDetectionState.totalTriangles).toBe(100);
  });
  it('emits mesh_block_updated for existing block', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('b1');
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_updated',
      expect.objectContaining({ blockId: 'b1' })
    );
  });
});

// ─── onEvent — misc ───────────────────────────────────────────────────────────

describe('meshDetectionHandler.onEvent — block_removed, scan_progress, pause/resume', () => {
  it('mesh_block_removed: decrements counts and removes from map', () => {
    const { node, cfg, ctx } = attachNode();
    const block = makeBlock('rem', 30, 15);
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_update', block });
    ctx.emit.mockClear();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_block_removed', blockId: 'rem' });
    expect((node as any).__meshDetectionState.meshBlocks.has('rem')).toBe(false);
    expect((node as any).__meshDetectionState.totalVertices).toBe(0);
    expect((node as any).__meshDetectionState.totalTriangles).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('mesh_block_remove', { blockId: 'rem' });
  });
  it('mesh_block_removed: ignores unknown blockId gracefully', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    expect(() =>
      meshDetectionHandler.onEvent!(node, cfg, ctx, {
        type: 'mesh_block_removed',
        blockId: 'ghost',
      })
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_block_remove', expect.any(Object));
  });
  it('mesh_scan_progress: updates scanProgress', () => {
    const { node, cfg, ctx } = attachNode();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_scan_progress', progress: 0.75 });
    expect((node as any).__meshDetectionState.scanProgress).toBe(0.75);
  });
  it('mesh_detection_pause: sets isScanning=false', () => {
    const { node, cfg, ctx } = attachNode();
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_detection_pause' });
    expect((node as any).__meshDetectionState.isScanning).toBe(false);
  });
  it('mesh_detection_resume: sets isScanning=true', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__meshDetectionState.isScanning = false;
    meshDetectionHandler.onEvent!(node, cfg, ctx, { type: 'mesh_detection_resume' });
    expect((node as any).__meshDetectionState.isScanning).toBe(true);
  });
});
