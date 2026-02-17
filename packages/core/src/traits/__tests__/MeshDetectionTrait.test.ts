import { describe, it, expect, beforeEach } from 'vitest';
import { meshDetectionHandler } from '../MeshDetectionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('MeshDetectionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    resolution: 'medium' as const,
    semantic_labeling: false,
    update_rate: 10,
    max_distance: 5,
    occlusion_enabled: true,
    physics_collider: true,
    visible: true,
    wireframe: false,
    block_size: 1.0,
  };

  const makeMockBlock = (id: string, verts = 100, tris = 50) => ({
    id,
    vertices: new Float32Array(verts * 3),
    indices: new Uint32Array(tris * 3),
    normals: new Float32Array(verts * 3),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    vertexCount: verts,
    triangleCount: tris,
    lastUpdated: 0,
  });

  beforeEach(() => {
    node = createMockNode('mesh');
    ctx = createMockContext();
    attachTrait(meshDetectionHandler, node, cfg, ctx);
  });

  it('initializes and starts scanning', () => {
    expect((node as any).__meshDetectionState.isScanning).toBe(true);
    expect(getEventCount(ctx, 'mesh_detection_start')).toBe(1);
  });

  it('mesh_block_update adds block and emits render+occlusion+collider', () => {
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_block_update', block: makeMockBlock('b1') });
    const s = (node as any).__meshDetectionState;
    expect(s.meshBlocks.size).toBe(1);
    expect(s.totalVertices).toBe(100);
    expect(getEventCount(ctx, 'mesh_block_render')).toBe(1);
    expect(getEventCount(ctx, 'mesh_occlusion_update')).toBe(1);
    expect(getEventCount(ctx, 'physics_add_mesh_collider')).toBe(1);
    expect(getEventCount(ctx, 'mesh_block_created')).toBe(1);
  });

  it('mesh_block_update replaces existing block', () => {
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_block_update', block: makeMockBlock('b1', 100, 50) });
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_block_update', block: makeMockBlock('b1', 200, 100) });
    expect((node as any).__meshDetectionState.totalVertices).toBe(200);
    expect(getEventCount(ctx, 'mesh_block_updated')).toBe(1);
  });

  it('mesh_block_removed removes block', () => {
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_block_update', block: makeMockBlock('b1') });
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_block_removed', blockId: 'b1' });
    expect((node as any).__meshDetectionState.meshBlocks.size).toBe(0);
    expect((node as any).__meshDetectionState.totalVertices).toBe(0);
  });

  it('scan_progress updates progress', () => {
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_scan_progress', progress: 0.75 });
    expect((node as any).__meshDetectionState.scanProgress).toBe(0.75);
  });

  it('pause and resume scanning', () => {
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_detection_pause' });
    expect((node as any).__meshDetectionState.isScanning).toBe(false);
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_detection_resume' });
    expect((node as any).__meshDetectionState.isScanning).toBe(true);
  });

  it('cleans up colliders and blocks on detach', () => {
    sendEvent(meshDetectionHandler, node, cfg, ctx, { type: 'mesh_block_update', block: makeMockBlock('b1') });
    ctx.clearEvents();
    meshDetectionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__meshDetectionState).toBeUndefined();
    expect(getEventCount(ctx, 'physics_remove_collider')).toBe(1);
    expect(getEventCount(ctx, 'mesh_block_remove')).toBe(1);
    expect(getEventCount(ctx, 'mesh_detection_stop')).toBe(1);
  });
});
