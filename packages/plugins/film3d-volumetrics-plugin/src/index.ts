import './crdt-spatial-augment';

export { createVolumetricHandler, type VolumetricConfig, type VolumetricFormat } from './traits/VolumetricTrait';
export { createGaussianSplatHandler, type GaussianSplatConfig } from './traits/GaussianSplatTrait';
export { createNeRFHandler, type NeRFConfig, type NeRFMethod } from './traits/NeRFTrait';
export { createCinematicCameraHandler, type CinematicCameraConfig, type CameraMovement } from './traits/CinematicCameraTrait';
export {
  createGCodeSlicerHandler,
  type GCodeSlicerConfig,
  type GCodeSlicerState,
  type GCodeSemanticParams,
  type MeshSliceInput,
  type AdhesionLayerPlanEntry,
  type TraversalLayerPlan,
  buildAdhesionLayerPlan,
  buildInsetPerimeterTraversal,
  buildSemanticGCodePreamble,
  buildTraversalStackFromMesh
} from './traits/GCodeSlicerTrait';
export * from './traits/types';

import {
  FILM3D_VOLUMETRICS_ROOT,
  ensureFilm3dVolumetricsRoot,
  registerVolumetricNode,
  setVolumetricChunk,
  setVolumetricVoxelPayload,
  unregisterVolumetricNode
} from '@holoscript/crdt-spatial';
import { createVolumetricHandler } from './traits/VolumetricTrait';
import { createGaussianSplatHandler } from './traits/GaussianSplatTrait';
import { createNeRFHandler } from './traits/NeRFTrait';
import { createCinematicCameraHandler } from './traits/CinematicCameraTrait';
import { createGCodeSlicerHandler } from './traits/GCodeSlicerTrait';

export {
  FILM3D_VOLUMETRICS_ROOT,
  ensureFilm3dVolumetricsRoot,
  registerVolumetricNode,
  setVolumetricChunk,
  setVolumetricVoxelPayload,
  unregisterVolumetricNode
};

import type { LoroDoc } from 'loro-crdt';

/**
 * Eagerly registers the volumetrics root map on the provided Loro doc so that
 * the LoroWebRTCProvider includes VDB / voxel payloads in every `export({ mode: 'update' })`
 * emitted to peers — guaranteeing zero-data-loss volumetric sync from connection start.
 *
 * Call once after constructing `MeshNodeIntegrator` and before the first
 * `registerVolumetricNode` / `setVolumetricVoxelPayload` invocation.
 */
export function registerVolumetricsWithProvider(doc: LoroDoc): void {
  ensureFilm3dVolumetricsRoot(doc);
}

export const pluginMeta = {
  name: '@holoscript/plugin-film3d-volumetrics',
  version: '1.0.0',
  traits: ['volumetric', 'gaussian_splat', 'nerf', 'cinematic_camera', 'gcode_slicer'],
  /** Root map on the shared Loro doc replicated by LoroWebRTCProvider */
  crdtVolumetricsRoot: FILM3D_VOLUMETRICS_ROOT
};
export const traitHandlers = [createVolumetricHandler(), createGaussianSplatHandler(), createNeRFHandler(), createCinematicCameraHandler(), createGCodeSlicerHandler()];
