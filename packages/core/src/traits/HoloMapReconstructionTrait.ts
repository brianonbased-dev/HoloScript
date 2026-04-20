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
  sessionId?: string;
  replayHash?: string;
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
    context.setState?.({
      holomapReconstruction: {
        source: config.source,
        sourceRef: config.sourceRef ?? null,
        autoFinalize: config.autoFinalize,
      },
    });
    context.emit?.('holomap:attached', {
      source: config.source,
      sourceRef: config.sourceRef ?? null,
      autoFinalize: config.autoFinalize,
    });
  },

  onEvent(node, _config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__holomapState as
      | HoloMapReconstructionState
      | undefined;
    if (!state) return;

    const payload = event.payload ?? {};
    if (event.type === 'holomap:session_started') {
      state.isActive = true;
      state.lastError = null;
      state.sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : state.sessionId;
      state.replayHash = typeof payload.replayHash === 'string' ? payload.replayHash : state.replayHash;
      context.emit?.('reconstruction:session_started', {
        sessionId: state.sessionId,
        replayHash: state.replayHash,
      });
      return;
    }

    if (event.type === 'holomap:step_result') {
      if (typeof payload.frameIndex === 'number' && Number.isFinite(payload.frameIndex)) {
        state.framesProcessed = Math.max(state.framesProcessed, payload.frameIndex + 1);
      } else {
        state.framesProcessed += 1;
      }
      context.emit?.('reconstruction:progress', {
        framesProcessed: state.framesProcessed,
      });
      return;
    }

    if (event.type === 'holomap:finalized') {
      state.isActive = false;
      if (payload.manifest && typeof payload.manifest === 'object') {
        state.lastManifest = payload.manifest as ReconstructionManifest;
      }
      context.emit?.('reconstruction:manifest', {
        framesProcessed: state.framesProcessed,
        replayHash: state.lastManifest?.replayHash ?? state.replayHash,
      });
      return;
    }

    if (event.type === 'holomap:error') {
      state.isActive = false;
      state.lastError = typeof payload.message === 'string' ? payload.message : 'unknown holomap error';
      context.emit?.('reconstruction:error', {
        message: state.lastError,
      });
    }
  },

  onDetach(node, _config, context) {
    const state = (node as unknown as Record<string, unknown>).__holomapState as
      | HoloMapReconstructionState
      | undefined;
    if (state) {
      context.emit?.('holomap:detached', {
        framesProcessed: state.framesProcessed,
        replayHash: state.replayHash ?? null,
      });
    }
    delete (node as unknown as Record<string, unknown>).__holomapState;
  },
};
