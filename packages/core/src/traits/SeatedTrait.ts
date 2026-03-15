/**
 * Seated Trait
 *
 * Implements seated VR interaction mode for HoloScript+ objects:
 * - Constrains movement to seated-friendly boundaries
 * - Adjusts height and reach for seated users
 * - Provides comfort options for seated gameplay
 *
 * @version 1.0.0
 */

import type { Vector3 } from '../types';
import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface SeatedTrait {
  /** Height offset from seated position (meters) */
  height_offset: number;
  /** Maximum forward reach (meters) */
  max_reach: number;
  /** Enable automatic height calibration */
  auto_calibrate: boolean;
  /** Comfort vignette on rotation */
  comfort_vignette: boolean;
  /** Snap turning angle (degrees, 0 = smooth) */
  snap_turn_angle: number;
  /** Bounds for seated play area [width, depth] */
  play_bounds: [number, number];
}

interface SeatedState {
  isCalibrated: boolean;
  calibratedHeight: number;
  originalPosition: Vector3;
  currentReach: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const seatedHandler: TraitHandler<SeatedTrait> = {
  name: 'seated',

  defaultConfig: {
    height_offset: 0,
    max_reach: 1.0,
    auto_calibrate: true,
    comfort_vignette: true,
    snap_turn_angle: 45,
    play_bounds: [1.5, 1.5],
  },

  onAttach(node, config, context) {
    const state: SeatedState = {
      isCalibrated: false,
      calibratedHeight: 1.2, // Default seated height
      originalPosition: (node.properties?.position as any) || [0, 0, 0],
      currentReach: 0,
    };
    (node as any).__seatedState = state;

    // Auto-calibrate on attach
    if (config.auto_calibrate) {
      state.calibratedHeight = (context.vr.headset.position as any)[1];
      state.isCalibrated = true;
    }
  },

  onDetach(node) {
    delete (node as any).__seatedState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__seatedState as SeatedState;
    if (!state) return;

    const headPos = context.vr.headset.position as any;
    const origin = state.originalPosition as any;

    // Calculate reach distance from center
    const dx = headPos[0] - origin[0];
    const dz = headPos[2] - origin[2];
    state.currentReach = Math.sqrt(dx * dx + dz * dz);

    // Clamp within play bounds
    const maxReach = config.max_reach * context.getScaleMultiplier();
    if (state.currentReach > maxReach) {
      // Apply gentle resistance near boundary
      const resistance = Math.min((state.currentReach - maxReach) / 0.5, 1);
      if (config.comfort_vignette && resistance > 0.2) {
        context.emit('vignette', { intensity: resistance * 0.5 });
      }
    }

    // Apply height offset
    if (node.properties?.position) {
      const pos = node.properties.position as any;
      node.properties.position = [
        pos[0],
        state.calibratedHeight + config.height_offset,
        pos[2],
      ] as any;
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__seatedState as SeatedState;
    if (!state) return;

    // Handle recalibration request
    if ((event as any).type === 'recalibrate') {
      state.calibratedHeight = (context.vr.headset.position as any)[1];
      state.isCalibrated = true;
      context.emit('seated_calibrated', { height: state.calibratedHeight });
    }

    // Handle snap turn
    if ((event as any).type === 'turn_left' || (event as any).type === 'turn_right') {
      const angle = config.snap_turn_angle || 45;
      const direction = (event as any).type === 'turn_left' ? -1 : 1;
      const currentRot = (node.properties?.rotation as any) || [0, 0, 0];

      (node.properties as any).rotation = [
        currentRot[0],
        currentRot[1] + angle * direction,
        currentRot[2],
      ];

      // Comfort vignette on snap turn
      if (config.comfort_vignette) {
        context.emit('vignette', { intensity: 0.3, duration: 200 });
      }
    }
  },
};

export default seatedHandler;
