/**
 * @holoscript/core Flow Field Trait
 *
 * Implements NPC navigation using GPU-accelerated flow fields.
 * Agents steer towards a destination by sampling a direction from the NavigationEngine.
 */

import type { TraitHandler } from './TraitTypes';
import { getNavigationEngine } from '@holoscript/engine/runtime/NavigationEngine';
import type { Vector3 } from '../types/HoloScriptPlus';

export interface FlowFieldConfig {
  /** ID of the destination to follow */
  destinationId: string;

  /** Speed of the agent */
  speed?: number;

  /** How much the agent should steer towards the flow direction (0-1) */
  steeringWeight?: number;

  /** Stop distance from destination */
  stopDistance?: number;
}

interface FlowFieldState {
  currentDirection: Vector3;
  isMoving: boolean;
}

function toTuple(v: Vector3): Vector3 {
  if (Array.isArray(v)) return v as Vector3;
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
}

export const flowFieldHandler: TraitHandler<FlowFieldConfig> = {
  name: 'flow_field',

  defaultConfig: {
    destinationId: '',
    speed: 3.0,
    steeringWeight: 0.8,
    stopDistance: 0.5,
  },

  onAttach(node, _config, _context) {
    const state: FlowFieldState = {
      currentDirection: [0, 0, 0],
      isMoving: false,
    };
    node.__flowFieldState = state;
  },

  onDetach(node) {
    delete node.__flowFieldState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__flowFieldState as FlowFieldState;
    if (!state || !config.destinationId) return;

    const navEngine = getNavigationEngine('gpu_flowfield') || getNavigationEngine('default');
    if (!navEngine) return;

    const currentPos = toTuple((node.properties?.position as Vector3) || [0, 0, 0]);

    // Sample direction from flow field
    // @ts-expect-error
    const flowDir = toTuple(navEngine.sampleDirection(config.destinationId, currentPos));

    // Combine with current movement or apply directly
    const speed = config.speed ?? 3.0;
    const steeringWeight = config.steeringWeight ?? 0.8;

    // Basic steering logic
    state.currentDirection = [
      state.currentDirection[0] * (1 - steeringWeight) + flowDir[0] * steeringWeight,
      state.currentDirection[1] * (1 - steeringWeight) + flowDir[1] * steeringWeight,
      state.currentDirection[2] * (1 - steeringWeight) + flowDir[2] * steeringWeight,
    ];

    // Normalize direction
    const mag = Math.sqrt(
      state.currentDirection[0] ** 2 +
        state.currentDirection[1] ** 2 +
        state.currentDirection[2] ** 2
    );

    if (mag > 0.001) {
      const normalizedDir: Vector3 = [
        state.currentDirection[0] / mag,
        state.currentDirection[1] / mag,
        state.currentDirection[2] / mag,
      ];

      // Update position
      if (node.properties) {
        node.properties.position = [
          currentPos[0] + normalizedDir[0] * speed * delta,
          currentPos[1] + normalizedDir[1] * speed * delta,
          currentPos[2] + normalizedDir[2] * speed * delta,
        ];

        // Face the direction of movement
        node.properties.rotation = [
          0,
          Math.atan2(normalizedDir[0], normalizedDir[2]) * (180 / Math.PI),
          0,
        ];
      }

      state.isMoving = true;
    } else {
      state.isMoving = false;
    }
  },
};

export default flowFieldHandler;
