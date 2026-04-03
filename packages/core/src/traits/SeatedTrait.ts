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
import type { HSPlusNode } from '../types/HoloScriptPlus';

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
  originalPosition: Vector3 | number[];
  currentReach: number;
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, SeatedState>();

// =============================================================================
// HANDLER
// =============================================================================

/** Extract a numeric component from a position-like value */
function posComponent(pos: unknown, index: number): number {
  if (Array.isArray(pos)) return (pos[index] as number) ?? 0;
  if (pos && typeof pos === 'object') {
    const keys = ['x', 'y', 'z'];
    return ((pos as Record<string, unknown>)[keys[index]] as number) ?? 0;
  }
  return 0;
}

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
      originalPosition: (node.properties?.position as Vector3 | number[]) || [0, 0, 0],
      currentReach: 0,
    };
    traitState.set(node, state);

    // Auto-calibrate on attach
    if (config.auto_calibrate) {
      state.calibratedHeight = context.vr.headset.position.y ?? 1.2;
      state.isCalibrated = true;
    }
  },

  onDetach(node) {
    traitState.delete(node);
  },

  onUpdate(node, config, context, _delta) {
    const state = traitState.get(node);
    if (!state) return;

    const headPos = context.vr.headset.position;
    const origin = state.originalPosition;

    // Calculate reach distance from center
    const dx = (headPos.x ?? 0) - posComponent(origin, 0);
    const dz = (headPos.z ?? 0) - posComponent(origin, 2);
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
      const pos = node.properties.position;
      node.properties.position = [
        posComponent(pos, 0),
        state.calibratedHeight + config.height_offset,
        posComponent(pos, 2),
      ];
    }
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    // Handle recalibration request
    if (event.type === 'recalibrate') {
      state.calibratedHeight = context.vr.headset.position.y ?? 1.2;
      state.isCalibrated = true;
      context.emit('seated_calibrated', { height: state.calibratedHeight });
    }

    // Handle snap turn
    if (event.type === 'turn_left' || event.type === 'turn_right') {
      const angle = config.snap_turn_angle || 45;
      const direction = event.type === 'turn_left' ? -1 : 1;
      const currentRot = node.properties?.rotation;
      const rotY = posComponent(currentRot, 1);

      node.properties!.rotation = [
        posComponent(currentRot, 0),
        rotY + angle * direction,
        posComponent(currentRot, 2),
      ];

      // Comfort vignette on snap turn
      if (config.comfort_vignette) {
        context.emit('vignette', { intensity: 0.3, duration: 200 });
      }
    }
  },
};

export default seatedHandler;
