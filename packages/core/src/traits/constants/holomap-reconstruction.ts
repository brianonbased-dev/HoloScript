/**
 * HoloMap — native WebGPU reconstruction trait family (Sprint 1 stubs).
 *
 * Declares HoloScript-owned reconstruction sessions (vs platform `scene_reconstruction`).
 * See `packages/core/src/reconstruction/RFC-HoloMap.md`.
 */

export const HOLOMAP_RECONSTRUCTION_TRAITS = [
  'holomap_reconstruct',
  'holomap_camera_trajectory',
  'holomap_anchor_context',
  'holomap_drift_correction',
  'holomap_splat_output',
] as const;

export type HolomapReconstructionTraitName = (typeof HOLOMAP_RECONSTRUCTION_TRAITS)[number];
