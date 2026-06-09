/**
 * @telescope_optics Trait — Physical Telescope Optics Calculator
 *
 * Derives optical parameters from physical telescope specifications:
 *   - Magnification from objective focal length / eyepiece focal length (× barlow)
 *   - True field of view from apparent eyepiece FOV / magnification
 *   - Exit pupil (determines if the image is usable by a human eye)
 *   - Limiting magnitude via aperture-based empirical formula
 *   - Dawes limit (minimum angular resolution)
 *   - Diffraction ring visibility flag
 *
 * This lets HoloScript scenes specify a telescope combination once and
 * have fov_deg / magnification derived rather than hardcoded as magic numbers.
 *
 * Suggested API shape (from A-009 2026-06-09 request):
 * ```
 * @telescope_optics {
 *   objective_diameter_mm: 600,
 *   focal_length_mm: 2400,
 *   eyepiece_focal_length_mm: 12,
 *   barlow_factor: 1.0
 * }
 * → derives: fov_deg≈0.25, magnification=200, exit_pupil_mm=3.0,
 *            limiting_magnitude≈15.5, dawes_limit_arcsec≈0.19,
 *            diffraction_rings_visible=true
 * ```
 *
 * Pairs naturally with @starfield, @aurora, and @orbital for observatory scenes.
 * Emits validation warnings when exit pupil > 7 mm (exceeds dark-adapted eye)
 * or < 0.5 mm (diffraction-limited, dim view).
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { logger } from '../logger';

// =============================================================================
// TYPES
// =============================================================================

export interface TelescopeOpticsConfig {
  /**
   * Objective (primary lens/mirror) diameter in millimetres.
   * Drives light-gathering, limiting magnitude, and Dawes limit.
   * @minimum 1
   * @default 200
   */
  objective_diameter_mm: number;

  /**
   * Objective focal length in millimetres.
   * Together with eyepiece_focal_length_mm this determines magnification.
   * @minimum 1
   * @default 1000
   */
  focal_length_mm: number;

  /**
   * Eyepiece focal length in millimetres.
   * Shorter = higher magnification, narrower true FOV.
   * @minimum 1
   * @default 10
   */
  eyepiece_focal_length_mm: number;

  /**
   * Barlow lens multiplication factor.
   * 1.0 = no Barlow. 2.0 = 2× Barlow (doubles magnification, halves FOV and exit pupil).
   * @minimum 1
   * @default 1.0
   */
  barlow_factor: number;

  /**
   * Apparent field of view (AFOV) of the eyepiece, in degrees.
   * Typical values: 50° (Plössl), 68° (wide-angle), 82° (wide-field premium).
   * Used to compute true FOV: true_fov = afov / magnification.
   * @minimum 1
   * @maximum 120
   * @default 52
   */
  apparent_fov_deg: number;

  /**
   * Maximum dark-adapted pupil diameter of the human eye, in mm.
   * Exit pupil above this value means light is wasted; below 0.5 mm the view dims.
   * @minimum 1
   * @maximum 9
   * @default 7.0
   */
  max_eye_pupil_mm: number;
}

/**
 * Derived optical properties emitted by the trait on attach and query.
 * These are read-only results — they are not inputs.
 */
export interface TelescopeOpticsDerived {
  /** Total magnification: (focal_length / eyepiece_focal_length) × barlow */
  magnification: number;

  /**
   * True field of view in degrees: apparent_fov / magnification.
   * This is the value to feed to @eyepiece_view fov_deg.
   */
  fov_deg: number;

  /**
   * Exit pupil in mm: objective_diameter / magnification.
   * Human eye accepts 0.5–7 mm (dark-adapted). Outside this range a warning is emitted.
   */
  exit_pupil_mm: number;

  /**
   * Limiting visual magnitude (point sources) using the aperture formula:
   * limiting_magnitude ≈ 2.1 + 5 × log10(aperture_mm).
   * This is the standard empirical formula for visual limiting magnitude.
   */
  limiting_magnitude: number;

  /**
   * Dawes limit in arc-seconds: 116 / objective_diameter_mm.
   * The theoretical minimum angular separation resolvable (resolving power).
   */
  dawes_limit_arcsec: number;

  /**
   * True if magnification is high enough to resolve Airy diffraction rings.
   * Heuristic: magnification > 0.75 × objective_diameter_mm.
   * At this zoom level diffraction patterns are visually prominent.
   */
  diffraction_rings_visible: boolean;
}

/** Validation warnings surfaced when the config produces an unrealistic setup. */
export interface TelescopeOpticsWarnings {
  /** Exit pupil exceeds the dark-adapted eye limit — light is wasted. */
  exit_pupil_too_large?: boolean;
  /** Exit pupil below 0.5 mm — image will be very dim. */
  exit_pupil_too_small?: boolean;
  /** Magnification exceeds 2× the aperture in mm — image will degrade. */
  magnification_exceeds_max?: boolean;
}

// =============================================================================
// PURE OPTICS FUNCTIONS (exported for use in tests and renderers)
// =============================================================================

/**
 * Compute all derived optical quantities from a TelescopeOpticsConfig.
 * Pure function — no side effects, no node/context coupling.
 */
export function computeTelescopeOptics(cfg: TelescopeOpticsConfig): TelescopeOpticsDerived {
  const magnification =
    (cfg.focal_length_mm / cfg.eyepiece_focal_length_mm) * cfg.barlow_factor;

  const fov_deg = cfg.apparent_fov_deg / magnification;

  const exit_pupil_mm = cfg.objective_diameter_mm / magnification;

  // Limiting magnitude: empirical formula  2.1 + 5 × log10(D_mm)
  const limiting_magnitude = 2.1 + 5 * Math.log10(cfg.objective_diameter_mm);

  // Dawes limit (arc-seconds): 116 / D_mm
  const dawes_limit_arcsec = 116 / cfg.objective_diameter_mm;

  // Diffraction rings become visible when magnification > 0.75 × D_mm
  const diffraction_rings_visible = magnification > 0.75 * cfg.objective_diameter_mm;

  return {
    magnification,
    fov_deg,
    exit_pupil_mm,
    limiting_magnitude,
    dawes_limit_arcsec,
    diffraction_rings_visible,
  };
}

/**
 * Validate a derived result against known physical limits.
 * Returns a (possibly empty) warnings bag.
 */
export function validateTelescopeOptics(
  cfg: TelescopeOpticsConfig,
  derived: TelescopeOpticsDerived
): TelescopeOpticsWarnings {
  const warnings: TelescopeOpticsWarnings = {};

  if (derived.exit_pupil_mm > cfg.max_eye_pupil_mm) {
    warnings.exit_pupil_too_large = true;
  }
  if (derived.exit_pupil_mm < 0.5) {
    warnings.exit_pupil_too_small = true;
  }
  // Rule of thumb: useful magnification cap ≈ 2× aperture in mm
  if (derived.magnification > 2 * cfg.objective_diameter_mm) {
    warnings.magnification_exceeds_max = true;
  }

  return warnings;
}

// =============================================================================
// STATE
// =============================================================================

interface TelescopeState {
  derived: TelescopeOpticsDerived;
  warnings: TelescopeOpticsWarnings;
}

/** Per-node state stored in WeakMap (avoids cluttering node objects). */
const traitState = new WeakMap<HSPlusNode, TelescopeState>();

// =============================================================================
// HANDLER
// =============================================================================

export const telescopeOpticsHandler: TraitHandler<TelescopeOpticsConfig> = {
  name: 'telescope_optics',

  defaultConfig: {
    objective_diameter_mm: 200,
    focal_length_mm: 1000,
    eyepiece_focal_length_mm: 10,
    barlow_factor: 1.0,
    apparent_fov_deg: 52,
    max_eye_pupil_mm: 7.0,
  },

  onAttach(node, config, context) {
    const derived = computeTelescopeOptics(config);
    const warnings = validateTelescopeOptics(config, derived);

    traitState.set(node, { derived, warnings });

    if (warnings.exit_pupil_too_large) {
      logger.warn(
        `[TelescopeOpticsTrait] ${node.name}: exit_pupil ${derived.exit_pupil_mm.toFixed(2)} mm ` +
          `exceeds max_eye_pupil ${config.max_eye_pupil_mm} mm — ` +
          `light will be wasted; increase magnification or use a shorter eyepiece.`
      );
    }
    if (warnings.exit_pupil_too_small) {
      logger.warn(
        `[TelescopeOpticsTrait] ${node.name}: exit_pupil ${derived.exit_pupil_mm.toFixed(2)} mm ` +
          `is below 0.5 mm — image will be very dim; decrease magnification.`
      );
    }
    if (warnings.magnification_exceeds_max) {
      logger.warn(
        `[TelescopeOpticsTrait] ${node.name}: magnification ${derived.magnification.toFixed(0)}× ` +
          `exceeds 2× aperture limit (${2 * config.objective_diameter_mm}×) — ` +
          `image quality will degrade; reduce Barlow factor or use a longer eyepiece.`
      );
    }

    context.emit('telescope_optics_ready', {
      nodeId: node.id,
      ...derived,
      warnings,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('telescope_optics_detach', { nodeId: node.id });
      traitState.delete(node);
    }
  },

  onEvent(node, config, context, event) {
    switch (event.type) {
      // Recalculate with a new config patch and re-emit.
      case 'telescope_optics_reconfigure': {
        const patch = event.config as Partial<TelescopeOpticsConfig> | undefined;
        if (!patch) break;
        const merged: TelescopeOpticsConfig = { ...config, ...patch };
        const derived = computeTelescopeOptics(merged);
        const warnings = validateTelescopeOptics(merged, derived);
        const state = traitState.get(node);
        if (state) {
          state.derived = derived;
          state.warnings = warnings;
        }
        context.emit('telescope_optics_updated', {
          nodeId: node.id,
          ...derived,
          warnings,
        });
        break;
      }

      // Return full current state snapshot for debugging / HoloScript queries.
      case 'telescope_optics_query': {
        const state = traitState.get(node);
        if (!state) break;
        context.emit('telescope_optics_info', {
          queryId: event.queryId,
          nodeId: node.id,
          config: { ...config },
          ...state.derived,
          warnings: { ...state.warnings },
        });
        break;
      }
    }
  },
};
