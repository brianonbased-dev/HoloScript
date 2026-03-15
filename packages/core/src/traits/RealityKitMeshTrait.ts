/**
 * RealityKit Mesh Trait (V43 Tier 3)
 *
 * Integrates with Apple RealityKit mesh anchors for precise occlusion,
 * physics, and semantic classification of the physical environment.
 * Extends scene_reconstruction with RealityKit-specific APIs.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type MeshClassification =
  | 'none'
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'table'
  | 'seat'
  | 'window'
  | 'door'
  | 'stairs'
  | 'bed'
  | 'counter'
  | 'unknown';

export interface RealityKitMeshConfig {
  mesh_classification: boolean;
  physics_enabled: boolean;
  occlusion_enabled: boolean;
  collision_margin: number; // meters
  update_frequency: number; // Hz
  max_anchor_distance: number; // meters
  render_wireframe: boolean; // debug: show mesh wireframe
}

interface MeshAnchor {
  id: string;
  classification: MeshClassification;
  vertexCount: number;
  faceCount: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

interface RealityKitMeshState {
  isActive: boolean;
  anchors: Map<string, MeshAnchor>;
  totalVertices: number;
  totalFaces: number;
  lastUpdateTime: number;
  classificationCounts: Partial<Record<MeshClassification, number>>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const realityKitMeshHandler: TraitHandler<RealityKitMeshConfig> = {
  name: 'realitykit_mesh',

  defaultConfig: {
    mesh_classification: true,
    physics_enabled: true,
    occlusion_enabled: true,
    collision_margin: 0.02,
    update_frequency: 10,
    max_anchor_distance: 8.0,
    render_wireframe: false,
  },

  onAttach(node, config, context) {
    const state: RealityKitMeshState = {
      isActive: false,
      anchors: new Map(),
      totalVertices: 0,
      totalFaces: 0,
      lastUpdateTime: 0,
      classificationCounts: {},
    };
    context.setState({ realityKitMesh: state });
    context.emit('rkMesh:init', {
      classification: config.mesh_classification,
      physics: config.physics_enabled,
    });
  },

  onUpdate(node, config, context, delta) {
    const state = context.getState().realityKitMesh as RealityKitMeshState | undefined;
    if (!state?.isActive) return;

    state.lastUpdateTime += delta;
    const updateInterval = 1 / config.update_frequency;

    if (state.lastUpdateTime >= updateInterval) {
      state.lastUpdateTime = 0;
      context.emit('rkMesh:tick', {
        anchorCount: state.anchors.size,
        totalFaces: state.totalFaces,
      });
    }
  },

  onDetach(node, config, context) {
    const state = context.getState().realityKitMesh as RealityKitMeshState | undefined;
    if (state) {
      state.anchors.clear();
      state.isActive = false;
    }
    context.emit('rkMesh:cleanup');
  },

  onEvent(node, config, context, event) {
    const state = context.getState().realityKitMesh as RealityKitMeshState | undefined;
    if (!state) return;

    if (event.type === 'rkMesh:started') {
      state.isActive = true;
    } else if (event.type === 'rkMesh:anchor_added') {
      const anchor = event.payload as MeshAnchor;
      state.anchors.set(anchor.id, anchor);
      state.totalVertices += anchor.vertexCount;
      state.totalFaces += anchor.faceCount;
      if (config.mesh_classification && anchor.classification !== 'none') {
        state.classificationCounts[anchor.classification] =
          (state.classificationCounts[anchor.classification] ?? 0) + 1;
      }
      context.emit('rkMesh:anchor_added', { id: anchor.id, classification: anchor.classification });
    } else if (event.type === 'rkMesh:anchor_removed') {
      const id = (event.payload as any)?.id as string;
      const anchor = state.anchors.get(id);
      if (anchor) {
        state.totalVertices -= anchor.vertexCount;
        state.totalFaces -= anchor.faceCount;
        state.anchors.delete(id);
      }
    }
  },
};
