/**
 * AnchorContext — coordinate-frame anchor for world-grounded reconstruction.
 *
 * Fixes a reference coordinate frame so subsequent frames resolve in a
 * consistent world space. Feeds the `@holomap_anchor_context` trait and
 * the provenance field of the exported manifest.
 *
 * Scope (Sprint 1): state shape + interface. Anchor-selection policy
 * lands in Sprint 2.
 *
 * @version 0.0.1 (scaffold)
 */

import type { CameraPose } from './HoloMapRuntime';

// =============================================================================
// TYPES
// =============================================================================

export interface AnchorContextState {
  /** Frame index used as the coordinate-frame anchor */
  anchorFrameIndex: number;
  /** Pose of the anchor frame in world space (defines the origin) */
  anchorPose: CameraPose;
  /** Feature descriptor for re-localization after tracking loss */
  anchorDescriptor: Float32Array;
  /** Monotonic revision (for replay diffing) */
  revision: number;
}

export interface AnchorContextConfig {
  /** Minimum frames to observe before committing an anchor */
  warmupFrames: number;
  /** Minimum reconstructor confidence to commit an anchor */
  minConfidence: number;
  /** Re-anchor if drift estimate exceeds this (meters) */
  maxDriftBeforeReanchor: number;
}

export const ANCHOR_DEFAULTS: AnchorContextConfig = {
  warmupFrames: 30,
  minConfidence: 0.75,
  maxDriftBeforeReanchor: 2.0,
};

// =============================================================================
// INTERFACE
// =============================================================================

export interface AnchorContext {
  readonly config: AnchorContextConfig;

  /** Propose a candidate anchor frame — returns true if committed */
  propose(frameIndex: number, pose: CameraPose, descriptor: Float32Array): boolean;

  /** Whether the context currently has a committed anchor */
  hasAnchor(): boolean;

  /** Snapshot for replay / manifest export */
  snapshot(): AnchorContextState;

  /** Restore from a replay snapshot */
  restore(state: AnchorContextState): void;

  /** Drop the current anchor (forces re-anchoring on next `propose`) */
  reset(): void;
}

// =============================================================================
// FACTORY (stub)
// =============================================================================

export function createAnchorContext(_config?: Partial<AnchorContextConfig>): AnchorContext {
  throw new Error(
    'AnchorContext is scaffolded in Sprint 1; implementation lands in Sprint 2. See reconstruction/RFC-HoloMap.md §Anchor'
  );
}
