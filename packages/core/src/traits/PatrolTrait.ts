import type { Vector3 } from '../types';
/**
 * Patrol Trait
 *
 * Patrol route/waypoint system with multiple modes.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface Waypoint extends Array<number> {
  0: number;
  1: number;
  2: number;
  waitTime?: number; // Override default wait time
  action?: string; // Action to perform at waypoint
}

type PatrolMode = 'loop' | 'pingpong' | 'random' | 'once';

interface PatrolState {
  currentIndex: number;
  direction: 1 | -1; // For pingpong
  isPaused: boolean;
  isWaiting: boolean;
  waitTimer: number;
  isAlerted: boolean;
  alertPosition: Vector3 | null;
  completed: boolean;
  visitedSet: Set<number>; // For random mode
}

interface PatrolConfig {
  waypoints: Waypoint[];
  mode: PatrolMode;
  speed: number;
  wait_time: number;
  alert_on_detection: boolean;
  resume_after_alert: boolean;
  alert_wait_time: number;
  path_smoothing: boolean;
  look_ahead: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function distance3D(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
}

function moveToward(
  current: readonly [number, number, number],
  target: readonly [number, number, number],
  speed: number,
  delta: number
): [number, number, number, boolean] {
  const dist = distance3D(current, target);
  const step = speed * delta;

  if (dist <= step) {
    return [target[0], target[1], target[2], true];
  }

  const ratio = step / dist;
  return [
    current[0] + (target[0] - current[0]) * ratio,
    current[1] + (target[1] - current[1]) * ratio,
    current[2] + (target[2] - current[2]) * ratio,
    false,
  ];
}

function getNextIndex(state: PatrolState, config: PatrolConfig): number {
  const count = config.waypoints.length;
  if (count === 0) return 0;

  switch (config.mode) {
    case 'loop':
      return (state.currentIndex + 1) % count;

    case 'pingpong':
      const next = state.currentIndex + state.direction;
      if (next >= count - 1) {
        state.direction = -1;
        return count - 1;
      } else if (next <= 0) {
        state.direction = 1;
        return 0;
      }
      return next;

    case 'random':
      if (state.visitedSet.size >= count) {
        state.visitedSet.clear();
      }
      let randomIndex: number;
      do {
        randomIndex = Math.floor(Math.random() * count);
      } while (state.visitedSet.has(randomIndex) && state.visitedSet.size < count);
      state.visitedSet.add(randomIndex);
      return randomIndex;

    case 'once':
      if (state.currentIndex >= count - 1) {
        state.completed = true;
        return state.currentIndex;
      }
      return state.currentIndex + 1;

    default:
      return (state.currentIndex + 1) % count;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const patrolHandler: TraitHandler<PatrolConfig> = {
  name: 'patrol',

  defaultConfig: {
    waypoints: [],
    mode: 'loop',
    speed: 2,
    wait_time: 2,
    alert_on_detection: true,
    resume_after_alert: true,
    alert_wait_time: 5,
    path_smoothing: false,
    look_ahead: true,
  },

  onAttach(node, config, context) {
    const state: PatrolState = {
      currentIndex: 0,
      direction: 1,
      isPaused: false,
      isWaiting: false,
      waitTimer: 0,
      isAlerted: false,
      alertPosition: null,
      completed: false,
      visitedSet: new Set(),
    };
    node.__patrolState = state;

    if (config.waypoints.length > 0) {
      context.emit?.('patrol_started', { node, waypoints: config.waypoints.length });
    }
  },

  onDetach(node) {
    delete node.__patrolState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__patrolState as PatrolState;
    if (!state || state.isPaused || state.completed) return;
    if (config.waypoints.length === 0) return;

    const position = (node.position || [0, 0, 0]) as [number, number, number];

    // Handle alert state
    if (state.isAlerted) {
      state.waitTimer += delta;
      if (state.waitTimer >= config.alert_wait_time) {
        state.isAlerted = false;
        state.alertPosition = null;
        state.waitTimer = 0;

        if (!config.resume_after_alert) {
          state.isPaused = true;
        }
        context.emit?.('patrol_alert_ended', { node });
      }
      return;
    }

    // Handle waiting at waypoint
    if (state.isWaiting) {
      state.waitTimer += delta;
      const waypoint = config.waypoints[state.currentIndex];
      const waitTime = waypoint?.waitTime ?? config.wait_time;

      if (state.waitTimer >= waitTime) {
        state.isWaiting = false;
        state.waitTimer = 0;

        // Execute waypoint action if any
        if (waypoint?.action) {
          context.emit?.('patrol_action', {
            node,
            action: waypoint.action,
            waypointIndex: state.currentIndex,
          });
        }

        // Move to next waypoint
        state.currentIndex = getNextIndex(state, config);

        context.emit?.('patrol_waypoint_left', {
          node,
          fromIndex: state.currentIndex,
          toIndex: state.currentIndex,
        });
      }
      return;
    }

    // Move toward current waypoint
    const target = config.waypoints[state.currentIndex];
    if (!target) return;

    const targetVec: [number, number, number] = [target[0], target[1], target[2]];
    const result = moveToward(position, targetVec, config.speed, delta);

    // Update position
    context.emit?.('set_position', {
      node,
      position: [result[0], result[1], result[2]],
    });

    // Look toward movement direction
    if (config.look_ahead && !result[3]) {
      const dx = target[0] - position[0];
      const dz = target[2] - position[2];
      const angle = Math.atan2(dx, dz);
      context.emit?.('set_rotation', {
        node,
        rotation: [0, angle, 0 ],
      });
    }

    // Reached waypoint
    if (result[3]) {
      state.isWaiting = true;
      state.waitTimer = 0;

      context.emit?.('patrol_waypoint_reached', {
        node,
        waypointIndex: state.currentIndex,
        waypoint: target,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__patrolState as PatrolState;
    if (!state) return;

    if (event.type === 'patrol_pause') {
      state.isPaused = true;
      context.emit?.('patrol_paused', { node });
    } else if (event.type === 'patrol_resume') {
      state.isPaused = false;
      state.completed = false;
      context.emit?.('patrol_resumed', { node });
    } else if (event.type === 'patrol_alert' && config.alert_on_detection) {
      state.isAlerted = true;
      state.alertPosition = event.position as [number, number, number];
      state.waitTimer = 0;
      context.emit?.('patrol_alerted', {
        node,
        alertPosition: state.alertPosition,
      });
    } else if (event.type === 'patrol_goto') {
      const index = event.waypointIndex as number;
      if (index >= 0 && index < config.waypoints.length) {
        state.currentIndex = index;
        state.isWaiting = false;
      }
    } else if (event.type === 'patrol_reset') {
      state.currentIndex = 0;
      state.direction = 1;
      state.isPaused = false;
      state.isWaiting = false;
      state.isAlerted = false;
      state.completed = false;
      state.visitedSet.clear();
    }
  },
};

export default patrolHandler;
