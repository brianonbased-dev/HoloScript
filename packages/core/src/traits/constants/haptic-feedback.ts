/**
 * Haptic Holographic Feedback Traits (M.010.05)
 *
 * Tactile patterns mapped to holographic interactions.
 * iOS: Core Haptics. Android: VibrationEffect.
 *
 * Categories:
 *   - Interaction (touch, grab, throw, collision)
 *   - Ambient (proximity, texture, resistance)
 *   - System (enable, intensity, pattern library)
 */
export const HAPTIC_FEEDBACK_TRAITS = [
  // --- Interaction ---
  'haptic_touch',              // vibration on hologram touch
  'haptic_grab',               // resistance pulse when grabbing
  'haptic_throw',              // release burst when throwing
  'haptic_impact',             // impact feedback on collision
  'haptic_select',             // click feedback on selection

  // --- Ambient ---
  'haptic_proximity',          // increasing vibration as hand nears hologram
  'haptic_texture',            // surface texture simulation (rough, smooth, bumpy)
  'haptic_resistance',         // force feedback simulation via vibration patterns

  // --- System ---
  'haptic_enable',             // enable haptic feedback engine
  'haptic_intensity',          // global intensity multiplier (0.0-1.0)
  'haptic_pattern_library',    // load custom haptic patterns (AHAP on iOS, VibrationEffect on Android)
] as const;

export type HapticFeedbackTraitName = (typeof HAPTIC_FEEDBACK_TRAITS)[number];
