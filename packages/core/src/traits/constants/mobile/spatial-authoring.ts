/**
 * Spatial Authoring Traits (M.010.08)
 *
 * Mobile spatial authoring traits that turn phones into 3D creation tools.
 * Users place, scale, browse, command, and undo holographic objects using
 * native device sensors (gyroscope, accelerometer, microphone) and gestures
 * (pinch, swipe, tap, shake).
 *
 * Categories:
 *   - Gyro Placement (rotation-vector stabilised object placement)
 *   - Pinch Scale (pinch gesture → entity scale)
 *   - Swipe Browse (horizontal swipe to browse and apply traits)
 *   - Voice Commands (speech-to-text command parsing)
 *   - Shake Undo (accelerometer threshold → undo stack pop)
 */
export const SPATIAL_AUTHORING_TRAITS = [
  // --- Gyro Placement ---
  'author_gyro_place', // gyroscope-stabilised AR object placement

  // --- Pinch Scale ---
  'author_pinch_scale', // pinch-to-scale selected entity

  // --- Swipe Browse ---
  'author_swipe_browse', // horizontal swipe to browse trait palette

  // --- Voice Commands ---
  'author_voice_cmd', // speech recognition → parse and execute commands

  // --- Shake Undo ---
  'author_shake_undo', // shake device to undo last action
] as const;

export type SpatialAuthoringTraitName = (typeof SPATIAL_AUTHORING_TRAITS)[number];

/**
 * Default configuration values for spatial authoring.
 */
export const SPATIAL_AUTHORING_DEFAULTS = {
  /** Gyro low-pass filter alpha (0-1, lower = smoother) */
  gyroFilterAlpha: 0.15,
  /** Minimum pinch scale factor */
  pinchScaleMin: 0.1,
  /** Maximum pinch scale factor */
  pinchScaleMax: 10.0,
  /** Shake acceleration threshold (m/s^2) to trigger undo */
  shakeThreshold: 12.0,
  /** Speech recognition locale */
  speechLocale: 'en-US',
  /** Maximum undo stack depth */
  undoStackDepth: 50,
} as const;
