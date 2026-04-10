/**
 * RoomMeshTrait Production Tests
 *
 * Whole-room mesh reconstruction with semantic classification.
 * Covers: defaultConfig, onAttach, onDetach, onUpdate (rate-limiting, request_update),
 * and all onEvent types: mesh_block_update (new/update, render, collider, semantic),
 * mesh_block_removed, room_boundary_detected (floorArea, roomHeight), room_mesh_complete,
 * scan_progress, pause, resume.
 * Also covers helpers: estimateFloorArea, computeRoomBounds.
 */

import { describe, it, expect, vi } from 'vitest';
import { roomMeshHandler } from '../RoomMeshTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'rm_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...roomMeshHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  roomMeshHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__roomMeshState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  roomMeshHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

function makeBlock(
  id: string,
  opts: {
    vertexCount?: number;
    triangleCount?: number;
    semanticLabel?: string;
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
    minZ?: number;
    maxZ?: number;
  } = {}
) {
  return {
    id,
    vertices: new Float32Array([0, 0, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: new Float32Array([0, 1, 0]),
    bounds: {
      min: { x: opts.minX ?? 0, y: opts.minY ?? 0, z: opts.minZ ?? 0 },
      max: { x: opts.maxX ?? 2, y: opts.maxY ?? 1, z: opts.maxZ ?? 2 },
    },
    semanticLabel: opts.semanticLabel,
    lastUpdated: Date.now(),
    vertexCount: opts.vertexCount ?? 3,
    triangleCount: opts.triangleCount ?? 1,
  };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('RoomMeshTrait — defaultConfig', () => {
  it('has 8 fields with correct defaults', () => {
    const d = roomMeshHandler.defaultConfig!;
    expect(d.resolution).toBe('medium');
    expect(d.update_rate).toBe(5);
    expect(d.semantic_labeling).toBe(true);
    expect(d.room_boundary_detection).toBe(true);
    expect(d.physics_collider).toBe(true);
    expect(d.merge_adjacent_blocks).toBe(false);
    expect(d.visible).toBe(false);
    expect(d.wireframe).toBe(false);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('RoomMeshTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.meshBlocks).toBeInstanceOf(Map);
    expect(s.meshBlocks.size).toBe(0);
    expect(s.detectedSurfaces).toBeInstanceOf(Map);
    expect(s.roomBounds).toBeNull();
    expect(s.isScanning).toBe(true);
    expect(s.totalVertices).toBe(0);
    expect(s.totalTriangles).toBe(0);
    expect(s.scanProgress).toBe(0);
    expect(s.physicsColliderIds).toHaveLength(0);
    expect(s.lastUpdateTime).toBe(0);
  });

  it('emits room_mesh_start with resolution + semantic fields', () => {
    const node = makeNode();
    const { ctx, cfg } = attach(node, { resolution: 'high', semantic_labeling: false });
    expect(ctx.emit).toHaveBeenCalledWith(
      'room_mesh_start',
      expect.objectContaining({
        resolution: 'high',
        semanticLabeling: false,
        roomBoundaryDetection: true,
      })
    );
  });

  it('sets isScanning=true after attach', () => {
    const node = makeNode();
    attach(node);
    expect(st(node).isScanning).toBe(true);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('RoomMeshTrait — onDetach', () => {
  it('emits physics_remove_collider for each collider', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: true });
    const block = makeBlock('b1');
    fire(node, cfg, ctx, { type: 'mesh_block_update', block });
    ctx.emit.mockClear();
    roomMeshHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_remove_collider',
      expect.objectContaining({ colliderId: 'room_collider_b1' })
    );
  });

  it('emits mesh_block_remove for each block', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).meshBlocks.set('x1', makeBlock('x1'));
    ctx.emit.mockClear();
    roomMeshHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_remove',
      expect.objectContaining({ blockId: 'x1' })
    );
  });

  it('emits room_mesh_stop when isScanning=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    roomMeshHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('room_mesh_stop', expect.any(Object));
  });

  it('does NOT emit room_mesh_stop when paused', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isScanning = false;
    ctx.emit.mockClear();
    roomMeshHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('room_mesh_stop', expect.any(Object));
  });

  it('removes __roomMeshState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    roomMeshHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__roomMeshState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('RoomMeshTrait — onUpdate', () => {
  it('no-op when isScanning=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isScanning = false;
    ctx.emit.mockClear();
    roomMeshHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('rate-limited: no emit when interval not elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { update_rate: 5 }); // 200ms interval
    st(node).lastUpdateTime = Date.now() - 50;
    ctx.emit.mockClear();
    roomMeshHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits room_mesh_request_update when interval elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { update_rate: 5 });
    st(node).lastUpdateTime = 0; // force elapsed
    ctx.emit.mockClear();
    roomMeshHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('room_mesh_request_update', expect.any(Object));
  });
});

// ─── onEvent — mesh_block_update (new) ────────────────────────────────────────

describe('RoomMeshTrait — onEvent: mesh_block_update (new block)', () => {
  it('stores block + increments totalVertices + totalTriangles', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: false });
    const block = makeBlock('b1', { vertexCount: 12, triangleCount: 4 });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(st(node).meshBlocks.has('b1')).toBe(true);
    expect(st(node).totalVertices).toBe(12);
    expect(st(node).totalTriangles).toBe(4);
  });

  it('emits room_mesh_block_created for new block', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: false });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    expect(ctx.emit).toHaveBeenCalledWith(
      'room_mesh_block_created',
      expect.objectContaining({
        blockId: 'b1',
        totalBlocks: 1,
      })
    );
  });

  it('emits room_mesh_block_updated for existing block', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: false });
    st(node).meshBlocks.set('b1', makeBlock('b1', { vertexCount: 3 }));
    st(node).totalVertices = 3;
    st(node).totalTriangles = 1;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b1', { vertexCount: 6, triangleCount: 2 }),
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'room_mesh_block_updated',
      expect.objectContaining({ blockId: 'b1' })
    );
    // old subtracted, new added: 3 - 3 + 6 = 6
    expect(st(node).totalVertices).toBe(6);
    expect(st(node).totalTriangles).toBe(2);
  });

  it('emits mesh_block_render when visible=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      visible: true,
      physics_collider: false,
      semantic_labeling: false,
    });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_render',
      expect.objectContaining({ blockId: 'b1', wireframe: false })
    );
  });

  it('wireframe flag passed through in render', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      visible: true,
      wireframe: true,
      physics_collider: false,
      semantic_labeling: false,
    });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_render',
      expect.objectContaining({ wireframe: true })
    );
  });

  it('does NOT emit mesh_block_render when visible=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      visible: false,
      physics_collider: false,
      semantic_labeling: false,
    });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    expect(ctx.emit).not.toHaveBeenCalledWith('mesh_block_render', expect.any(Object));
  });

  it('emits physics_add_mesh_collider when physics_collider=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: true, semantic_labeling: false });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_mesh_collider',
      expect.objectContaining({
        colliderId: 'room_collider_b1',
        isStatic: true,
      })
    );
    expect(st(node).physicsColliderIds).toContain('room_collider_b1');
  });

  it('does not duplicate collider ID on repeated block update', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: true, semantic_labeling: false });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block: makeBlock('b1') });
    expect(
      st(node).physicsColliderIds.filter((id: string) => id === 'room_collider_b1')
    ).toHaveLength(1);
  });

  it('classifies semantic surface and emits room_surface_classified', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: true });
    const block = makeBlock('b1', { semanticLabel: 'floor', minX: 0, maxX: 4, minZ: 0, maxZ: 3 });
    fire(node, cfg, ctx, { type: 'mesh_block_update', block });
    expect(ctx.emit).toHaveBeenCalledWith(
      'room_surface_classified',
      expect.objectContaining({
        blockId: 'b1',
        surfaceType: 'floor',
      })
    );
    expect(st(node).detectedSurfaces.has('floor')).toBe(true);
    // area: dx=4, dz=3 => 12
    expect(st(node).detectedSurfaces.get('floor').area).toBeCloseTo(12, 1);
  });

  it('accumulates area from multiple blocks of same surface', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: true });
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b1', { semanticLabel: 'floor', minX: 0, maxX: 2, minZ: 0, maxZ: 2 }),
    });
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b2', { semanticLabel: 'floor', minX: 2, maxX: 4, minZ: 0, maxZ: 2 }),
    });
    const floorArea = st(node).detectedSurfaces.get('floor').area;
    expect(floorArea).toBeCloseTo(8, 1); // 4+4
  });

  it('does NOT emit room_surface_classified when semantic_labeling=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: false });
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b1', { semanticLabel: 'floor' }),
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('room_surface_classified', expect.any(Object));
  });

  it('computes roomBounds when room_boundary_detection=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      physics_collider: false,
      semantic_labeling: false,
      room_boundary_detection: true,
    });
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b1', { minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: -2, maxZ: 2 }),
    });
    const bounds = st(node).roomBounds;
    expect(bounds).not.toBeNull();
    expect(bounds.min.x).toBe(-1);
    expect(bounds.max.y).toBe(3);
  });
});

// ─── onEvent — mesh_block_removed ─────────────────────────────────────────────

describe('RoomMeshTrait — onEvent: mesh_block_removed', () => {
  it('removes block, decrements counters, emits mesh_block_remove', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: false });
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b1', { vertexCount: 9, triangleCount: 3 }),
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'mesh_block_removed', blockId: 'b1' });
    expect(st(node).meshBlocks.has('b1')).toBe(false);
    expect(st(node).totalVertices).toBe(0);
    expect(st(node).totalTriangles).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'mesh_block_remove',
      expect.objectContaining({ blockId: 'b1' })
    );
  });

  it('unknown blockId is ignored gracefully', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    expect(() =>
      fire(node, cfg, ctx, { type: 'mesh_block_removed', blockId: 'ghost' })
    ).not.toThrow();
  });
});

// ─── onEvent — room_boundary_detected ─────────────────────────────────────────

describe('RoomMeshTrait — onEvent: room_boundary_detected', () => {
  it('stores roomBounds and emits on_room_mapped with correct fields', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: true });
    // Add a floor block so estimateFloorArea returns non-zero
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('floor1', { semanticLabel: 'floor', minX: 0, maxX: 3, minZ: 0, maxZ: 4 }),
    });
    ctx.emit.mockClear();

    const bounds = { min: { x: -1, y: 0, z: -1 }, max: { x: 4, y: 2.5, z: 5 } };
    fire(node, cfg, ctx, { type: 'room_boundary_detected', bounds });

    expect(st(node).roomBounds).toStrictEqual(bounds);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_room_mapped',
      expect.objectContaining({
        bounds,
        roomHeight: 2.5, // max.y - min.y
        surfaceCount: 1,
        totalBlocks: 1,
      })
    );
    // floorArea = dx*dz = 3*4 = 12
    const call = (ctx.emit as any).mock.calls.find((c: any[]) => c[0] === 'on_room_mapped')?.[1];
    expect(call.floorArea).toBeCloseTo(12, 1);
  });
});

// ─── onEvent — room_mesh_complete ─────────────────────────────────────────────

describe('RoomMeshTrait — onEvent: room_mesh_complete', () => {
  it('stops scanning and emits on_room_mesh_complete with totals', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { physics_collider: false, semantic_labeling: false });
    fire(node, cfg, ctx, {
      type: 'mesh_block_update',
      block: makeBlock('b1', { vertexCount: 30, triangleCount: 10 }),
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'room_mesh_complete' });
    expect(st(node).isScanning).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_room_mesh_complete',
      expect.objectContaining({
        totalVertices: 30,
        totalTriangles: 10,
        totalBlocks: 1,
      })
    );
  });
});

// ─── onEvent — scan_progress, pause, resume ───────────────────────────────────

describe('RoomMeshTrait — onEvent: scan_progress, pause, resume', () => {
  it('room_mesh_scan_progress stores progress', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'room_mesh_scan_progress', progress: 0.63 });
    expect(st(node).scanProgress).toBeCloseTo(0.63);
  });

  it('room_mesh_pause stops isScanning', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    expect(st(node).isScanning).toBe(true);
    fire(node, cfg, ctx, { type: 'room_mesh_pause' });
    expect(st(node).isScanning).toBe(false);
  });

  it('room_mesh_resume restores isScanning', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isScanning = false;
    fire(node, cfg, ctx, { type: 'room_mesh_resume' });
    expect(st(node).isScanning).toBe(true);
  });
});
