/**
 * Eye Tracked Trait
 *
 * Implements eye tracking interactions for HoloScript+ objects:
 * - Gaze detection and dwell activation
 * - Eye-based selection and highlighting
 * - Foveated rendering hints
 * - Accessibility support for gaze-only interaction
 *
 * @version 1.0.0
 */

import type { Vector3 } from '../types';
import type { Vector3Tuple } from '../types/HoloScriptPlus';
import type { TraitHandler, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface EyeTrackedTrait {
  /** Enable dwell-to-activate (gaze for duration to click) */
  dwell_enabled: boolean;
  /** Time to dwell for activation (ms) */
  dwell_time: number;
  /** Visual feedback during dwell (progress indicator) */
  dwell_feedback: boolean;
  /** Highlight object when gazed at */
  gaze_highlight: boolean;
  /** Highlight color */
  highlight_color: string;
  /** Scale multiplier when gazed at */
  gaze_scale: number;
  /** Priority for foveated rendering (higher = more detail) */
  foveated_priority: 'low' | 'medium' | 'high';
  /** Tolerance angle for gaze detection (degrees) */
  gaze_tolerance: number;
  /** Enable smooth pursuit tracking */
  smooth_pursuit: boolean;
}

interface EyeTrackedState {
  isGazed: boolean;
  gazeStartTime: number;
  dwellProgress: number;
  originalScale: number;
  originalColor: string | null;
  lastGazePosition: Vector3Tuple;
  smoothPosition: Vector3Tuple;
}

// =============================================================================
// HELPERS
// =============================================================================

function toTuple(v: Vector3): Vector3Tuple {
  if (Array.isArray(v)) return v as Vector3Tuple;
  return [v.x, v.y, v.z];
}

interface GazeRay {
  origin: Vector3Tuple;
  direction: Vector3Tuple;
}

function getEyeGazeRay(context: TraitContext): GazeRay | null {
  // Get eye tracking data from headset
  // This would integrate with device-specific eye tracking APIs
  const headPos = toTuple(context.vr.headset.position);
  const headRot = toTuple(context.vr.headset.rotation);

  // Calculate forward direction from head rotation
  const radY = (headRot[1] * Math.PI) / 180;
  const radX = (headRot[0] * Math.PI) / 180;

  const direction: Vector3Tuple = [
    -Math.sin(radY) * Math.cos(radX),
    -Math.sin(radX),
    -Math.cos(radY) * Math.cos(radX),
  ];

  return {
    origin: headPos,
    direction,
  };
}

function isPointGazedAt(
  ray: GazeRay,
  point: Vector3Tuple,
  radius: number,
  toleranceDegrees: number
): boolean {
  // Vector from ray origin to point
  const toPoint: Vector3Tuple = [
    point[0] - ray.origin[0],
    point[1] - ray.origin[1],
    point[2] - ray.origin[2],
  ];

  // Distance to point
  const distance = Math.sqrt(
    toPoint[0] * toPoint[0] + toPoint[1] * toPoint[1] + toPoint[2] * toPoint[2]
  );

  if (distance === 0) return true;

  // Normalize
  const toPointNorm: Vector3Tuple = [
    toPoint[0] / distance,
    toPoint[1] / distance,
    toPoint[2] / distance,
  ];

  // Dot product with ray direction
  const dot =
    ray.direction[0] * toPointNorm[0] +
    ray.direction[1] * toPointNorm[1] +
    ray.direction[2] * toPointNorm[2];

  // Angle in degrees
  const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * (180 / Math.PI);

  // Add radius compensation (closer objects have more tolerance)
  const radiusTolerance = Math.atan(radius / distance) * (180 / Math.PI);

  return angle <= toleranceDegrees + radiusTolerance;
}

function rayPointAtDistance(ray: GazeRay, distance: number): Vector3Tuple {
  return [
    ray.origin[0] + ray.direction[0] * distance,
    ray.origin[1] + ray.direction[1] * distance,
    ray.origin[2] + ray.direction[2] * distance,
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// =============================================================================
// HANDLER
// =============================================================================

export const eyeTrackedHandler: TraitHandler<EyeTrackedTrait> = {
  name: 'eye_tracked',

  defaultConfig: {
    dwell_enabled: true,
    dwell_time: 1000,
    dwell_feedback: true,
    gaze_highlight: true,
    highlight_color: '#00ffff',
    gaze_scale: 1.1,
    foveated_priority: 'medium',
    gaze_tolerance: 2.0,
    smooth_pursuit: false,
  },

  onAttach(node, config, context) {
    const pos = toTuple((node.properties?.position as Vector3) || [0, 0, 0]);
    const state: EyeTrackedState = {
      isGazed: false,
      gazeStartTime: 0,
      dwellProgress: 0,
      originalScale: (node.properties?.scale as number) || 1,
      originalColor: (node.properties?.color as string) || null,
      lastGazePosition: [pos[0] || 0, pos[1] || 0, pos[2] || 0],
      smoothPosition: [pos[0] || 0, pos[1] || 0, pos[2] || 0],
    };
    node.__eyeTrackedState = state;

    // Register for foveated rendering
    context.emit('register_foveated', {
      node,
      priority: config.foveated_priority,
    });
  },

  onDetach(node, config, context) {
    const state = node.__eyeTrackedState as EyeTrackedState;

    // Restore original properties
    if (state && node.properties) {
      node.properties.scale = state.originalScale;
      if (state.originalColor) {
        node.properties.color = state.originalColor;
      }
    }

    // Unregister from foveated rendering
    context.emit('unregister_foveated', { node });

    delete node.__eyeTrackedState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__eyeTrackedState as EyeTrackedState;
    if (!state) return;

    // Get eye gaze data from VR context
    const gazeRay = getEyeGazeRay(context);
    if (!gazeRay) return;

    // Check if object is being gazed at
    const nodePos = toTuple((node.properties?.position as Vector3) || [0, 0, 0]);
    const nodeScale = (node.properties?.scale as number) || 1;
    const isGazed = isPointGazedAt(gazeRay, nodePos, nodeScale * 0.5, config.gaze_tolerance);

    // Handle gaze enter
    if (isGazed && !state.isGazed) {
      state.isGazed = true;
      state.gazeStartTime = Date.now();
      state.dwellProgress = 0;

      // Apply gaze highlight
      if (config.gaze_highlight && node.properties) {
        state.originalColor = (node.properties.color as string) || null;
        node.properties.color = config.highlight_color;
      }

      // Apply gaze scale
      if (config.gaze_scale !== 1 && node.properties) {
        state.originalScale = (node.properties.scale as number) || 1;
        node.properties.scale = state.originalScale * config.gaze_scale;
      }

      context.emit('gaze_enter', { node });
    }

    // Handle gaze exit
    if (!isGazed && state.isGazed) {
      state.isGazed = false;
      state.dwellProgress = 0;

      // Restore original properties
      if (config.gaze_highlight && state.originalColor && node.properties) {
        node.properties.color = state.originalColor;
      }

      if (config.gaze_scale !== 1 && node.properties) {
        node.properties.scale = state.originalScale;
      }

      context.emit('gaze_exit', { node });
    }

    // Handle dwell progress
    if (state.isGazed && config.dwell_enabled) {
      const elapsed = Date.now() - state.gazeStartTime;
      state.dwellProgress = Math.min(elapsed / config.dwell_time, 1);

      // Emit dwell progress for UI feedback
      if (config.dwell_feedback) {
        context.emit('dwell_progress', {
          node,
          progress: state.dwellProgress,
          position: nodePos,
        });
      }

      // Trigger activation on complete dwell
      if (state.dwellProgress >= 1) {
        context.emit('dwell_activate', { node });
        context.emit('click', { node, method: 'dwell' });

        // Reset dwell
        state.gazeStartTime = Date.now();
        state.dwellProgress = 0;
      }
    }

    // Handle smooth pursuit (object follows gaze smoothly)
    if (config.smooth_pursuit && state.isGazed) {
      const gazePoint = rayPointAtDistance(gazeRay, 2.0); // 2m in front
      const smoothSpeed = 5 * delta;

      state.smoothPosition = [
        lerp(state.smoothPosition[0], gazePoint[0], smoothSpeed),
        lerp(state.smoothPosition[1], gazePoint[1], smoothSpeed),
        lerp(state.smoothPosition[2], gazePoint[2], smoothSpeed),
      ];

      if (node.properties) {
        node.properties.position = state.smoothPosition;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__eyeTrackedState as EyeTrackedState;
    if (!state) return;

    // Handle manual gaze simulation (for testing/accessibility)
    if (event.type === 'simulate_gaze') {
      state.isGazed = event.active as boolean;
      if (state.isGazed) {
        state.gazeStartTime = Date.now();
      }
    }

    // Handle dwell cancel
    if (event.type === 'cancel_dwell') {
      state.dwellProgress = 0;
      state.gazeStartTime = Date.now();
    }
  },
};

export default eyeTrackedHandler;
