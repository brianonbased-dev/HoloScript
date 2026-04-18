/**
 * HoloMap Reconstruction Trait
 *
 * Binds a node to the HoloMap WebGPU reconstruction runtime. Declares the
 * node as the target of a feed-forward RGB→3D reconstruction session.
 *
 * Differs from SceneReconstructionTrait (`scene_reconstruction`), which
 * routes to ARCore/RealityKit. This trait runs reconstruction in-browser
 * on WebGPU via HoloMapRuntime.
 *
 * Scope (Sprint 1): stub handler. Full binding to HoloMapRuntime lands in
 * Sprint 2. See reconstruction/RFC-HoloMap.md.
 *
 * @version 0.0.1 (scaffold)
 */

import type { TraitHandler } from './TraitTypes';
import type { HoloMapConfig, ReconstructionManifest } from '../reconstruction/HoloMapRuntime';

// =============================================================================
// CONFIG
// =============================================================================

export interface HoloMapReconstructionConfig {
  /** Source of RGB frames */
  source: 'webcam' | 'video_url' | 'frame_folder';
  /** URL or identifier for the source (ignored when source='webcam') */
  sourceRef?: string;
  /** Runtime config override */
  runtime?: Partial<HoloMapConfig>;
  /** Emit a `reconstruction:manifest` event when finalize() completes */
  autoFinalize: boolean;
}

export interface HoloMapReconstructionState {
  isActive: boolean;
  framesProcessed: number;
  lastManifest: ReconstructionManifest | null;
  lastError: string | null;
}

// =============================================================================
// HANDLER (stub)
// =============================================================================

export const holomapReconstructionHandler: TraitHandler<HoloMapReconstructionConfig> = {
  name: 'holomap_reconstruct',

  defaultConfig: {
    source: 'webcam',
    autoFinalize: true,
  },

  onAttach(node, config, context) {
    const state: HoloMapReconstructionState = {
      isActive: false,
      framesProcessed: 0,
      lastManifest: null,
      lastError: null,
    };
    (node as unknown as Record<string, unknown>).__holomapState = state;
    context.emit?.('holomap:attached', { source: config.source });
  },

  onDetach(node) {
    delete (node as unknown as Record<string, unknown>).__holomapState;
  },
};
