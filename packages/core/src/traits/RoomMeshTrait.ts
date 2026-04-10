/**
 * RoomMesh Trait
 *
 * Whole-room mesh reconstruction with semantic surface classification.
 * Builds a complete spatial model of the physical environment — floor, walls,
 * ceiling, and furniture — with optional physics colliders.
 *
 * Differs from MeshDetectionTrait: RoomMesh converges to a complete room model
 * and emits `on_room_mapped` when coverage is sufficient. MeshDetection is a
 * continuous incremental stream.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type RoomMeshResolution = 'low' | 'medium' | 'high';
export type SemanticSurface = 'floor' | 'wall' | 'ceiling' | 'furniture' | 'unknown';

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface MeshBlock {
  id: string;
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  bounds: { min: Vector3; max: Vector3 };
  semanticLabel?: SemanticSurface;
  lastUpdated: number;
  vertexCount: number;
  triangleCount: number;
}

interface DetectedSurface {
  type: SemanticSurface;
  /** Estimated surface area in square meters */
  area: number;
  /** Block IDs contributing to this surface */
  blockIds: string[];
}

export interface RoomMeshConfig {
  /** Mesh reconstruction quality */
  resolution: RoomMeshResolution;
  /** How often to pull new mesh data (Hz) */
  update_rate: number;
  /** Classify surfaces as floor/wall/ceiling/furniture */
  semantic_labeling: boolean;
  /** Detect overall room boundary and dimensions */
  room_boundary_detection: boolean;
  /** Create static physics colliders from mesh */
  physics_collider: boolean;
  /** Merge coplanar adjacent blocks into unified surfaces */
  merge_adjacent_blocks: boolean;
  /** Debug: render the mesh */
  visible: boolean;
  /** Debug: wireframe mode */
  wireframe: boolean;
}

interface RoomMeshState {
  meshBlocks: Map<string, MeshBlock>;
  detectedSurfaces: Map<string, DetectedSurface>;
  roomBounds: { min: Vector3; max: Vector3 } | null;
  isScanning: boolean;
  totalVertices: number;
  totalTriangles: number;
  scanProgress: number;
  physicsColliderIds: string[];
  lastUpdateTime: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function estimateFloorArea(blocks: Map<string, MeshBlock>): number {
  let area = 0;
  for (const block of blocks.values()) {
    if (block.semanticLabel === 'floor') {
      const dx = block.bounds.max.x - block.bounds.min.x;
      const dz = block.bounds.max.z - block.bounds.min.z;
      area += dx * dz;
    }
  }
  return area;
}

function computeRoomBounds(blocks: Map<string, MeshBlock>): { min: Vector3; max: Vector3 } | null {
  if (blocks.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const block of blocks.values()) {
    minX = Math.min(minX, block.bounds.min.x);
    minY = Math.min(minY, block.bounds.min.y);
    minZ = Math.min(minZ, block.bounds.min.z);
    maxX = Math.max(maxX, block.bounds.max.x);
    maxY = Math.max(maxY, block.bounds.max.y);
    maxZ = Math.max(maxZ, block.bounds.max.z);
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

// =============================================================================
// HANDLER
// =============================================================================

export const roomMeshHandler: TraitHandler<RoomMeshConfig> = {
  name: 'room_mesh',

  defaultConfig: {
    resolution: 'medium',
    update_rate: 5,
    semantic_labeling: true,
    room_boundary_detection: true,
    physics_collider: true,
    merge_adjacent_blocks: false,
    visible: false,
    wireframe: false,
  },

  onAttach(node, config, context) {
    const state: RoomMeshState = {
      meshBlocks: new Map(),
      detectedSurfaces: new Map(),
      roomBounds: null,
      isScanning: false,
      totalVertices: 0,
      totalTriangles: 0,
      scanProgress: 0,
      physicsColliderIds: [],
      lastUpdateTime: 0,
    };
    node.__roomMeshState = state;

    context.emit?.('room_mesh_start', {
      node,
      resolution: config.resolution,
      semanticLabeling: config.semantic_labeling,
      roomBoundaryDetection: config.room_boundary_detection,
    });
    state.isScanning = true;
  },

  onDetach(node, _config, context) {
    const state = node.__roomMeshState as RoomMeshState;
    if (state) {
      for (const colliderId of state.physicsColliderIds) {
        context.emit?.('physics_remove_collider', { colliderId });
      }
      for (const [id] of state.meshBlocks) {
        context.emit?.('mesh_block_remove', { blockId: id });
      }
      if (state.isScanning) {
        context.emit?.('room_mesh_stop', { node });
      }
    }
    delete node.__roomMeshState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__roomMeshState as RoomMeshState;
    if (!state || !state.isScanning) return;

    const now = Date.now();
    const updateInterval = 1000 / config.update_rate;
    if (now - state.lastUpdateTime < updateInterval) return;
    state.lastUpdateTime = now;

    context.emit?.('room_mesh_request_update', { node });
  },

  onEvent(node, config, context, event) {
    const state = node.__roomMeshState as RoomMeshState;
    if (!state) return;

    if (event.type === 'mesh_block_update') {
      const block = event.block as MeshBlock;
      const isNew = !state.meshBlocks.has(block.id);
      const old = state.meshBlocks.get(block.id);

      if (old) {
        state.totalVertices -= old.vertexCount;
        state.totalTriangles -= old.triangleCount;
      }
      state.totalVertices += block.vertexCount;
      state.totalTriangles += block.triangleCount;
      block.lastUpdated = Date.now();
      state.meshBlocks.set(block.id, block);

      // Debug render
      if (config.visible) {
        context.emit?.('mesh_block_render', {
          blockId: block.id,
          vertices: block.vertices,
          indices: block.indices,
          normals: block.normals,
          wireframe: config.wireframe,
        });
      }

      // Physics colliders
      if (config.physics_collider) {
        const colliderId = `room_collider_${block.id}`;
        context.emit?.('physics_add_mesh_collider', {
          colliderId,
          vertices: block.vertices,
          indices: block.indices,
          isStatic: true,
        });
        if (!state.physicsColliderIds.includes(colliderId)) {
          state.physicsColliderIds.push(colliderId);
        }
      }

      // Semantic surface classification
      if (config.semantic_labeling && block.semanticLabel) {
        const surfaceKey = block.semanticLabel;
        const existing = state.detectedSurfaces.get(surfaceKey) ?? {
          type: block.semanticLabel,
          area: 0,
          blockIds: [],
        };
        if (!existing.blockIds.includes(block.id)) {
          existing.blockIds.push(block.id);
        }
        const dx = block.bounds.max.x - block.bounds.min.x;
        const dz = block.bounds.max.z - block.bounds.min.z;
        existing.area += dx * dz;
        state.detectedSurfaces.set(surfaceKey, existing);

        context.emit?.('room_surface_classified', {
          node,
          blockId: block.id,
          surfaceType: block.semanticLabel,
          totalSurfaces: state.detectedSurfaces.size,
        });
      }

      // Room boundary recalculation
      if (config.room_boundary_detection) {
        state.roomBounds = computeRoomBounds(state.meshBlocks);
      }

      context.emit?.(isNew ? 'room_mesh_block_created' : 'room_mesh_block_updated', {
        node,
        blockId: block.id,
        vertexCount: block.vertexCount,
        totalBlocks: state.meshBlocks.size,
      });
    } else if (event.type === 'mesh_block_removed') {
      const blockId = event.blockId as string;
      const block = state.meshBlocks.get(blockId);
      if (block) {
        state.totalVertices -= block.vertexCount;
        state.totalTriangles -= block.triangleCount;
        state.meshBlocks.delete(blockId);
        context.emit?.('mesh_block_remove', { blockId });
      }
    } else if (event.type === 'room_boundary_detected') {
      state.roomBounds = event.bounds as { min: Vector3; max: Vector3 };
      const floorArea = estimateFloorArea(state.meshBlocks);
      const bounds = state.roomBounds;
      const roomHeight = bounds ? bounds.max.y - bounds.min.y : 0;

      context.emit?.('on_room_mapped', {
        node,
        bounds: state.roomBounds,
        floorArea,
        roomHeight,
        surfaceCount: state.detectedSurfaces.size,
        totalBlocks: state.meshBlocks.size,
      });
    } else if (event.type === 'room_mesh_complete') {
      state.isScanning = false;
      context.emit?.('on_room_mesh_complete', {
        node,
        totalVertices: state.totalVertices,
        totalTriangles: state.totalTriangles,
        totalBlocks: state.meshBlocks.size,
        surfaces: Object.fromEntries(state.detectedSurfaces),
        roomBounds: state.roomBounds,
      });
    } else if (event.type === 'room_mesh_scan_progress') {
      state.scanProgress = event.progress as number;
    } else if (event.type === 'room_mesh_pause') {
      state.isScanning = false;
    } else if (event.type === 'room_mesh_resume') {
      state.isScanning = true;
    }
  },
};

export default roomMeshHandler;
