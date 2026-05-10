/**
 * MultiTargetTrackingTrait
 *
 * Sovereign HoloScript primitive for multi-user spatial tracking. Lifts the
 * MTT (Kalman + Hungarian + ReID) algorithm from uaa2-service's mid-flight
 * XR Glasses innovation track (DIRECTIVE_XRG_001, "Logan's AR research")
 * into a generalizable HoloScript trait that composes across six revival
 * surfaces (smart glasses, HoloLand multi-player worlds, Quest 3 multi-user,
 * AR-on-phones, room-scale games, HoloMap + @spatialProof location AR).
 *
 * Closes the original gap that killed first-gen smart glasses: no
 * multi-user social-XR. uaa2-service substrate verified 2026-05-10; this
 * trait makes the algorithm HoloScript-portable (not uaa2-only).
 *
 * Pairs with: research/2026-05-10_revive-smart-glasses.md, D.037 AI-revival
 * memo, I.012 revival-scan initiative, F.047 sentiment-vitality, and the
 * @spatialProof trait (commit 3fb5fca38c) — together the three sovereign
 * primitives of the smart-glasses revival bundle.
 *
 * The trait declaration here is compose-time scaffolding (validate + emit
 * target-specific code). The deterministic runtime tracker (Kalman state
 * predict/update + Hungarian frame-to-frame assignment + ReID embedding
 * similarity + persistent identity tracking) lives in `MultiTargetTracker.ts`.
 *
 * @version 0.1.0
 * @sovereignty NMoS sovereign primitive; transferable across revival surfaces
 * @sourceRefs research/2026-05-10_revive-smart-glasses.md (D.037 first proof)
 *             uaa2-service src/worlds/innovation/XR_GLASSES_DIRECTIVE.ts (MTT origin)
 *             uaa2-service src/worlds/innovation/_lib/xr-glasses-directive.hsplus (HoloScript companion)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type ReidFeature = 'appearance' | 'gait' | 'face' | 'skeleton' | 'accessory';

/**
 * Compose-time configuration for a `@multiTargetTracking` trait declaration.
 * Resolved into target-specific scaffolding by `compile()`.
 *
 * Defaults mirror the uaa2-service DIRECTIVE_XRG_001 v1.1.0 MTT block:
 *   - 90 Hz update rate (Kalman state vector)
 *   - 0.5 Hungarian association threshold
 *   - 30-frame max occlusion (~0.5s @ 60fps)
 *   - 256-dim ReID embedding
 *   - 0.75 ReID similarity threshold
 *   - 5-feature ReID (appearance + gait + face + skeleton + accessory)
 */
export interface MultiTargetTrackingConfig {
  /** Tracker update rate in Hz. Defaults to 90 (matches uaa2 directive). */
  update_rate_hz?: number;

  /** Hungarian association threshold (cost ≥ threshold rejects match). Defaults to 0.5. */
  hungarian_cost_threshold?: number;

  /** Maximum frames a track can be occluded before becoming lost. Defaults to 30. */
  max_occluded_frames?: number;

  /** ReID embedding dimensionality. Defaults to 256. */
  reid_embedding_dim?: number;

  /** ReID cosine-similarity threshold for re-identification. Defaults to 0.75. */
  reid_similarity_threshold?: number;

  /** ReID feature classes the embedding incorporates. Defaults to all five. */
  reid_features?: ReidFeature[];

  /**
   * Cost-matrix weighting between position distance and ReID similarity for
   * Hungarian assignment. Higher values weight position; lower values weight
   * appearance. Defaults to 0.5 (equal weighting).
   */
  position_vs_reid_weight?: number;
}

const DEFAULT_UPDATE_RATE_HZ = 90;
const DEFAULT_HUNGARIAN_THRESHOLD = 0.5;
const DEFAULT_MAX_OCCLUDED_FRAMES = 30;
const DEFAULT_REID_DIM = 256;
const DEFAULT_REID_SIMILARITY = 0.75;
const DEFAULT_REID_FEATURES: ReidFeature[] = ['appearance', 'gait', 'face', 'skeleton', 'accessory'];
const DEFAULT_POSITION_VS_REID_WEIGHT = 0.5;

const ALLOWED_REID_FEATURES: ReidFeature[] = ['appearance', 'gait', 'face', 'skeleton', 'accessory'];

function resolved(config: MultiTargetTrackingConfig): Required<MultiTargetTrackingConfig> {
  return {
    update_rate_hz: config.update_rate_hz ?? DEFAULT_UPDATE_RATE_HZ,
    hungarian_cost_threshold: config.hungarian_cost_threshold ?? DEFAULT_HUNGARIAN_THRESHOLD,
    max_occluded_frames: config.max_occluded_frames ?? DEFAULT_MAX_OCCLUDED_FRAMES,
    reid_embedding_dim: config.reid_embedding_dim ?? DEFAULT_REID_DIM,
    reid_similarity_threshold: config.reid_similarity_threshold ?? DEFAULT_REID_SIMILARITY,
    reid_features: config.reid_features ?? [...DEFAULT_REID_FEATURES],
    position_vs_reid_weight: config.position_vs_reid_weight ?? DEFAULT_POSITION_VS_REID_WEIGHT,
  };
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const MultiTargetTrackingTrait: TraitHandler<MultiTargetTrackingConfig> = {
  name: 'multi_target_tracking',

  validate(config: MultiTargetTrackingConfig): boolean {
    if (config.update_rate_hz !== undefined) {
      if (!Number.isFinite(config.update_rate_hz) || config.update_rate_hz <= 0) {
        throw new Error('MultiTargetTrackingTrait: update_rate_hz must be a positive number');
      }
      if (config.update_rate_hz < 30) {
        // 30Hz is the practical minimum for smooth tracking on consumer hardware.
        throw new Error(
          `MultiTargetTrackingTrait: update_rate_hz=${config.update_rate_hz} is below the 30Hz minimum; tracking will not be stable`
        );
      }
    }
    if (config.hungarian_cost_threshold !== undefined) {
      if (
        !Number.isFinite(config.hungarian_cost_threshold) ||
        config.hungarian_cost_threshold < 0 ||
        config.hungarian_cost_threshold > 1
      ) {
        throw new Error('MultiTargetTrackingTrait: hungarian_cost_threshold must be in [0, 1]');
      }
    }
    if (config.max_occluded_frames !== undefined) {
      if (!Number.isInteger(config.max_occluded_frames) || config.max_occluded_frames < 0) {
        throw new Error('MultiTargetTrackingTrait: max_occluded_frames must be a non-negative integer');
      }
    }
    if (config.reid_embedding_dim !== undefined) {
      if (!Number.isInteger(config.reid_embedding_dim) || config.reid_embedding_dim < 8) {
        throw new Error('MultiTargetTrackingTrait: reid_embedding_dim must be an integer >= 8');
      }
    }
    if (config.reid_similarity_threshold !== undefined) {
      if (
        !Number.isFinite(config.reid_similarity_threshold) ||
        config.reid_similarity_threshold < -1 ||
        config.reid_similarity_threshold > 1
      ) {
        throw new Error('MultiTargetTrackingTrait: reid_similarity_threshold must be in [-1, 1] (cosine)');
      }
    }
    if (config.reid_features !== undefined) {
      if (!Array.isArray(config.reid_features) || config.reid_features.length === 0) {
        throw new Error('MultiTargetTrackingTrait: reid_features must be a non-empty array if provided');
      }
      for (const feature of config.reid_features) {
        if (!ALLOWED_REID_FEATURES.includes(feature)) {
          throw new Error(
            `MultiTargetTrackingTrait: reid_features contains unknown feature '${feature}'. Allowed: ${ALLOWED_REID_FEATURES.join(', ')}`
          );
        }
      }
    }
    if (config.position_vs_reid_weight !== undefined) {
      if (
        !Number.isFinite(config.position_vs_reid_weight) ||
        config.position_vs_reid_weight < 0 ||
        config.position_vs_reid_weight > 1
      ) {
        throw new Error('MultiTargetTrackingTrait: position_vs_reid_weight must be in [0, 1]');
      }
    }
    return true;
  },

  compile(config: MultiTargetTrackingConfig, target: string): string {
    const self = this as unknown as Record<string, (c: MultiTargetTrackingConfig) => string>;
    switch (target) {
      case 'web':
      case 'react-three-fiber':
      case 'webxr':
        return self.compileWeb(config);
      case 'glasses':
      case 'brilliant-labs':
      case 'openxr':
        return self.compileGlasses(config);
      case 'node':
      case 'node-service':
      case 'mcp-server':
        return self.compileNode(config);
      default:
        return self.compileGeneric(config);
    }
  },

  compileWeb(config: MultiTargetTrackingConfig): string {
    const r = resolved(config);
    return `
// MultiTargetTracking — web/react-three-fiber/webxr scaffolding (sovereign primitive).
// Wire your detection source (camera + person-detector + pose-estimator + ReID-encoder)
// into stepTracker() each frame. The tracker runs Kalman predict/update + Hungarian
// frame-to-frame assignment + ReID embedding similarity for persistent identity.
import { createTracker, stepTracker } from '@holoscript/core/traits/MultiTargetTracker';

export const multiTargetTrackingConfig = ${JSON.stringify(r, null, 2)};

export function newSpatialTracker() {
  return createTracker(multiTargetTrackingConfig);
}

export function trackFrame(tracker, detections, frame) {
  // detections: [{position: [x,y,z], appearance_embedding: Float32Array}, ...]
  return stepTracker(tracker, detections, frame);
}
`.trim();
  },

  compileGlasses(config: MultiTargetTrackingConfig): string {
    const r = resolved(config);
    return `
// MultiTargetTracking — smart-glasses scaffolding (sovereign primitive).
// Target: Brilliant Labs Frame/Halo or OpenXR-compatible glasses runtime.
// Detection source: on-device SLAM + person detection + pose estimation + ReID encoder.
// Pairs with uaa2-service GlassesLabService and DIRECTIVE_XRG_001 MTT block.
import { createTracker, stepTracker } from '@holoscript/core/traits/MultiTargetTracker';

export const multiTargetTrackingConfig = ${JSON.stringify(r, null, 2)};

export function newGlassesTracker() {
  return createTracker(multiTargetTrackingConfig);
}
`.trim();
  },

  compileNode(config: MultiTargetTrackingConfig): string {
    const r = resolved(config);
    return `
// MultiTargetTracking — node/server scaffolding (sovereign primitive).
// Server-side composition: detection data comes from upstream agent payloads.
import { createTracker, stepTracker } from '@holoscript/core/traits/MultiTargetTracker';

export const multiTargetTrackingConfig = ${JSON.stringify(r, null, 2)};
`.trim();
  },

  compileGeneric(config: MultiTargetTrackingConfig): string {
    const r = resolved(config);
    return `
// MultiTargetTracking — generic scaffolding (sovereign primitive).
// Wire your platform's detection adapter into createTracker + stepTracker.
const multiTargetTrackingConfig = ${JSON.stringify(r, null, 2)};
`.trim();
  },
};

export default MultiTargetTrackingTrait;
