/**
 * @color_grade trait — Color grading and look management for film/VFX
 *
 * Supports LUT application, primary corrections (lift/gamma/gain),
 * and secondary adjustments (temperature, tint, contrast, saturation).
 * Designed for real-time preview in virtual production and offline grading.
 *
 * @module @holoscript/plugin-film-vfx
 */

// ============================================================================
// Types
// ============================================================================

export interface LiftGammaGain {
  /** Lift (shadows) — RGB offset, each channel -1 to 1 */
  lift: [number, number, number];
  /** Gamma (midtones) — RGB multiplier, each channel 0 to 4 */
  gamma: [number, number, number];
  /** Gain (highlights) — RGB multiplier, each channel 0 to 4 */
  gain: [number, number, number];
}

export interface ColorGradeConfig {
  /** LUT file path or built-in name */
  lut?: string;
  /** LUT intensity (0-1, blend with ungraded) */
  lutIntensity?: number;
  /** Color temperature in Kelvin (2000-12000) */
  temperature: number;
  /** Tint shift green-magenta (-100 to 100) */
  tint: number;
  /** Contrast adjustment (-100 to 100) */
  contrast: number;
  /** Saturation multiplier (0 = desaturated, 1 = normal, 2 = oversaturated) */
  saturation: number;
  /** Lift/Gamma/Gain color wheels */
  liftGammaGain: LiftGammaGain;
  /** Exposure offset in stops (-5 to 5) */
  exposure?: number;
  /** Highlight recovery (0-100) */
  highlights?: number;
  /** Shadow recovery (0-100) */
  shadows?: number;
  /** Vibrance (0-100, protects skin tones) */
  vibrance?: number;
  /** Film grain intensity (0-1) */
  grain?: number;
  /** Vignette intensity (0-1) */
  vignette?: number;
  /** Grade name for look management */
  gradeName?: string;
  /** CDL (Color Decision List) export compatibility */
  cdlCompatible?: boolean;
}

// ============================================================================
// Trait Handler
// ============================================================================

export interface ColorGradeTraitHandler {
  name: 'color_grade';
  defaultConfig: ColorGradeConfig;
  onAttach(entity: unknown, config: ColorGradeConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<ColorGradeConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): void;
}

export function createColorGradeHandler(): ColorGradeTraitHandler {
  return {
    name: 'color_grade',
    defaultConfig: {
      temperature: 6500,
      tint: 0,
      contrast: 0,
      saturation: 1,
      liftGammaGain: {
        lift: [0, 0, 0],
        gamma: [1, 1, 1],
        gain: [1, 1, 1],
      },
      exposure: 0,
      highlights: 0,
      shadows: 0,
      vibrance: 50,
      cdlCompatible: true,
    },
    onAttach(entity: unknown, config: ColorGradeConfig): void {
      // Apply LUT and color corrections to render pipeline
      void entity;
      void config;
    },
    onDetach(entity: unknown): void {
      // Remove grade from render pipeline, restore defaults
      void entity;
    },
    onUpdate(entity: unknown, config: Partial<ColorGradeConfig>): void {
      // Real-time grade adjustment (scrub, live preview)
      void entity;
      void config;
    },
    onEvent(entity: unknown, event: string, payload: unknown): void {
      // Handle events: 'snapshot_grade', 'apply_lut', 'reset', 'export_cdl'
      void entity;
      void event;
      void payload;
    },
  };
}
