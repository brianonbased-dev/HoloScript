import type { Vector3 } from '../types';
/**
 * MeshDetection Trait
 *
 * Real-time environment mesh reconstruction for spatial understanding.
 * Creates physics colliders and occlusion geometry from scanned environment.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type MeshResolution = 'low' | 'medium' | 'high';
type _SemanticLabel =
  | 'floor'
  | 'wall'
  | 'ceiling'
  | 'table'
  | 'chair'
  | 'door'
  | 'window'
  | 'screen'
  | 'plant'
  | 'unknown';

interface MeshBlock {
  id: string;
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  bounds: { min: Vector3; max: Vector3 };
  semanticLabels?: Uint8Array;
  lastUpdated: number;
  vertexCount: number;
  triangleCount: number;
}

interface MeshDetectionState {
  meshBlocks: Map<string, MeshBlock>;
  lastUpdateTime: number;
  isScanning: boolean;
  totalVertices: number;
  totalTriangles: number;
  scanProgress: number;
  physicsColliderIds: string[];
}

interface MeshDetectionConfig {
  resolution: MeshResolution;
  semantic_labeling: boolean;
  update_rate: number;
  max_distance: number;
  occlusion_enabled: boolean;
  physics_collider: boolean;
  visible: boolean;
  wireframe: boolean;
  block_size: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const meshDetectionHandler: TraitHandler<MeshDetectionConfig> = {
  name: 'mesh_detection',

  defaultConfig: {
    resolution: 'medium',
    semantic_labeling: false,
    update_rate: 10,
    max_distance: 5,
    occlusion_enabled: true,
    physics_collider: false,
    visible: false,
    wireframe: false,
    block_size: 1.0,
  },

  onAttach(node, config, context) {
    const state: MeshDetectionState = {
      meshBlocks: new Map(),
      lastUpdateTime: 0,
      isScanning: false,
      totalVertices: 0,
      totalTriangles: 0,
      scanProgress: 0,
      physicsColliderIds: [],
    };
    node.__meshDetectionState = state;

    context.emit?.('mesh_detection_start', {
      node,
      resolution: config.resolution,
      maxDistance: config.max_distance,
      semanticLabeling: config.semantic_labeling,
    });
    state.isScanning = true;
  },

  onDetach(node, config, context) {
    const state = node.__meshDetectionState as MeshDetectionState;
    if (state) {
      for (const colliderId of state.physicsColliderIds) {
        context.emit?.('physics_remove_collider', { colliderId });
      }
      for (const [id] of state.meshBlocks) {
        context.emit?.('mesh_block_remove', { blockId: id });
      }
      if (state.isScanning) {
        context.emit?.('mesh_detection_stop', { node });
      }
    }
    delete node.__meshDetectionState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__meshDetectionState as MeshDetectionState;
    if (!state || !state.isScanning) return;

    const now = Date.now();
    const updateInterval = 1000 / config.update_rate;

    if (now - state.lastUpdateTime < updateInterval) return;
    state.lastUpdateTime = now;

    context.emit?.('mesh_request_update', {
      node,
      maxDistance: config.max_distance,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__meshDetectionState as MeshDetectionState;
    if (!state) return;

    if (event.type === 'mesh_block_update') {
      const block = event.block as MeshBlock;
      const isNew = !state.meshBlocks.has(block.id);
      const oldBlock = state.meshBlocks.get(block.id);

      if (oldBlock) {
        state.totalVertices -= oldBlock.vertexCount;
        state.totalTriangles -= oldBlock.triangleCount;
      }
      state.totalVertices += block.vertexCount;
      state.totalTriangles += block.triangleCount;

      block.lastUpdated = Date.now();
      state.meshBlocks.set(block.id, block);

      if (config.visible) {
        context.emit?.('mesh_block_render', {
          blockId: block.id,
          vertices: block.vertices,
          indices: block.indices,
          normals: block.normals,
          wireframe: config.wireframe,
        });
      }

      if (config.occlusion_enabled) {
        context.emit?.('mesh_occlusion_update', {
          blockId: block.id,
          vertices: block.vertices,
          indices: block.indices,
        });
      }

      if (config.physics_collider) {
        const colliderId = `mesh_collider_${block.id}`;
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

      context.emit?.(isNew ? 'mesh_block_created' : 'mesh_block_updated', {
        node,
        blockId: block.id,
        vertexCount: block.vertexCount,
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
    } else if (event.type === 'mesh_scan_progress') {
      state.scanProgress = event.progress as number;
    } else if (event.type === 'mesh_detection_pause') {
      state.isScanning = false;
    } else if (event.type === 'mesh_detection_resume') {
      state.isScanning = true;
    }
  },
};

export default meshDetectionHandler;
