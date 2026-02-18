import { describe, it, expect, beforeEach } from 'vitest';
import { roomMeshHandler } from '../RoomMeshTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('RoomMeshTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    resolution: 'medium' as const,
    update_rate: 5,
    semantic_labeling: true,
    room_boundary_detection: true,
    physics_collider: true,
    merge_adjacent_blocks: false,
    visible: false,
    wireframe: false,
  };

  beforeEach(() => {
    node = createMockNode('room');
    ctx = createMockContext();
    attachTrait(roomMeshHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__roomMeshState;
    expect(state).toBeDefined();
    expect(state.isScanning).toBe(true);
    expect(state.totalVertices).toBe(0);
  });

  it('emits room_mesh_start on attach', () => {
    expect(getEventCount(ctx, 'room_mesh_start')).toBe(1);
  });

  it('mesh_block_update adds block', () => {
    const block = {
      id: 'b1',
      vertices: new Float32Array([0, 0, 0]),
      indices: new Uint32Array([0]),
      normals: new Float32Array([0, 1, 0]),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      semanticLabel: 'floor',
      vertexCount: 1,
      triangleCount: 1,
      lastUpdated: 0,
    };
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'mesh_block_update', block });
    const state = (node as any).__roomMeshState;
    expect(state.meshBlocks.size).toBe(1);
    expect(state.totalVertices).toBe(1);
    expect(getEventCount(ctx, 'room_mesh_block_created')).toBe(1);
  });

  it('mesh_block_update replaces existing block', () => {
    const block1 = {
      id: 'b1', vertices: new Float32Array([0]), indices: new Uint32Array([0]),
      normals: new Float32Array([0, 1, 0]),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      vertexCount: 10, triangleCount: 5, lastUpdated: 0,
    };
    const block2 = { ...block1, vertexCount: 20, triangleCount: 8 };
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'mesh_block_update', block: block1 });
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'mesh_block_update', block: block2 });
    expect((node as any).__roomMeshState.totalVertices).toBe(20);
    expect(getEventCount(ctx, 'room_mesh_block_updated')).toBe(1);
  });

  it('mesh_block_removed decrements totals', () => {
    const block = {
      id: 'b1', vertices: new Float32Array([0]), indices: new Uint32Array([0]),
      normals: new Float32Array([0, 1, 0]),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      vertexCount: 5, triangleCount: 2, lastUpdated: 0,
    };
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'mesh_block_update', block });
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'mesh_block_removed', blockId: 'b1' });
    expect((node as any).__roomMeshState.totalVertices).toBe(0);
  });

  it('room_mesh_complete stops scanning', () => {
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'room_mesh_complete' });
    expect((node as any).__roomMeshState.isScanning).toBe(false);
    expect(getEventCount(ctx, 'on_room_mesh_complete')).toBe(1);
  });

  it('room_mesh_pause and resume', () => {
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'room_mesh_pause' });
    expect((node as any).__roomMeshState.isScanning).toBe(false);
    sendEvent(roomMeshHandler, node, cfg, ctx, { type: 'room_mesh_resume' });
    expect((node as any).__roomMeshState.isScanning).toBe(true);
  });

  it('detach cleans up state', () => {
    roomMeshHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__roomMeshState).toBeUndefined();
  });
});
