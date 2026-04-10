/**
 * Scene Reconstruction Trait (V43 Tier 2)
 *
 * Real-time 3D mesh reconstruction of the physical environment using
 * ARCore/RealityKit scene understanding. Supports semantic mesh labeling
 * and physics collision generation.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type ReconstructionMode =
  | 'realtime'
  | 'high_fidelity'
  | 'room_scan'
  | 'object_scan'
  | 'semantic_mesh';
export type MeshDetail = 'low' | 'medium' | 'high';
export type SemanticLabel =
  | 'floor'
  | 'ceiling'
  | 'wall'
  | 'table'
  | 'chair'
  | 'window'
  | 'door'
  | 'unknown';

export interface SceneReconstructionConfig {
  reconstruction_mode: ReconstructionMode;
  mesh_detail: MeshDetail;
  semantic_labeling: boolean;
  physics_collision: boolean;
  occlusion_enabled: boolean;
  update_interval_ms: number;
  max_mesh_faces: number;
}

interface SceneReconstructionState {
  isScanning: boolean;
  meshFaceCount: number;
  lastUpdateTime: number;
  semanticLabels: Map<string, SemanticLabel>;
  physicsColliderCount: number;
  scanProgress: number; // 0–1
}

// =============================================================================
// HANDLER
// =============================================================================

export const sceneReconstructionHandler: TraitHandler<SceneReconstructionConfig> = {
  name: 'scene_reconstruction',

  defaultConfig: {
    reconstruction_mode: 'realtime',
    mesh_detail: 'medium',
    semantic_labeling: true,
    physics_collision: true,
    occlusion_enabled: true,
    update_interval_ms: 100,
    max_mesh_faces: 50000,
  },

  onAttach(node, config, context) {
    const state: SceneReconstructionState = {
      isScanning: false,
      meshFaceCount: 0,
      lastUpdateTime: 0,
      semanticLabels: new Map(),
      physicsColliderCount: 0,
      scanProgress: 0,
    };
    context.setState({ sceneReconstruction: state });
    context.emit('reconstruction:init', { mode: config.reconstruction_mode });
  },

  onUpdate(node, config, context, delta) {
    const state = context.getState().sceneReconstruction as SceneReconstructionState | undefined;
    if (!state?.isScanning) return;

    state.lastUpdateTime += delta;

    if (state.lastUpdateTime * 1000 >= config.update_interval_ms) {
      state.lastUpdateTime = 0;
      context.emit('reconstruction:mesh_update', {
        faceCount: state.meshFaceCount,
        progress: state.scanProgress,
      });
    }
  },

  onDetach(node, config, context) {
    context.emit('reconstruction:stop');
  },

  onEvent(node, config, context, event) {
    const state = context.getState().sceneReconstruction as SceneReconstructionState | undefined;
    if (!state) return;

    if (event.type === 'reconstruction:started') {
      state.isScanning = true;
      state.scanProgress = 0;
    } else if (event.type === 'reconstruction:mesh_received') {
      const payload = event.payload as
        | { faceCount?: number; labels?: Record<string, SemanticLabel> }
        | undefined;
      state.meshFaceCount = payload?.faceCount ?? state.meshFaceCount;
      state.scanProgress = Math.min(1, state.meshFaceCount / config.max_mesh_faces);
      if (config.semantic_labeling && payload?.labels) {
        for (const [id, label] of Object.entries(payload.labels)) {
          state.semanticLabels.set(id, label as SemanticLabel);
        }
      }
    } else if (event.type === 'reconstruction:complete') {
      state.isScanning = false;
      state.scanProgress = 1;
      context.emit('reconstruction:complete', { faceCount: state.meshFaceCount });
    }
  },
};
