/**
 * Spatiotemporal Trait Handlers
 *
 * Runtime trait handler implementations for the three spatiotemporal
 * constraint extensions:
 * - spatial_temporal_adjacent:  adjacency that must hold for N seconds
 * - spatial_temporal_reachable: reachability with moving obstacle velocity prediction
 * - spatial_trajectory:         path-based constraints over predicted entity motion
 *
 * These traits complement the base spatial constraints (spatial_adjacent,
 * spatial_contains, spatial_reachable) with temporal reasoning.
 *
 * @version 1.0.0
 * @module traits/SpatiotemporalTraits
 */

import type { TraitHandler, TraitContext } from '@holoscript/core';
import type {
  SpatialTemporalAdjacentConfig,
  SpatialTemporalReachableConfig,
  SpatialTrajectoryConfig,
  SpatialConstraintKind,
  SpatialConstraintViolationEvent,
  SpatialConstraintResolvedEvent,
  TrajectoryWaypoint,
} from '@holoscript/engine/spatial';
import type { Vector3 } from '@holoscript/core';

// =============================================================================
// SHARED HELPERS
// =============================================================================

/** Normalize core `{x,y,z}` or numeric tuples to components (trait code mixes both). */
function v3c(v: Vector3 | [number, number, number] | readonly [number, number, number]): [number, number, number] {
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
}

function computeDistance3D(
  a: Vector3 | [number, number, number] | readonly [number, number, number],
  b: Vector3 | [number, number, number] | readonly [number, number, number]
): number {
  const [ax, ay, az] = v3c(a);
  const [bx, by, bz] = v3c(b);
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computeAxisDistance(
  a: Vector3 | [number, number, number] | readonly [number, number, number],
  b: Vector3 | [number, number, number] | readonly [number, number, number],
  axis: string
): number {
  const [ax, ay, az] = v3c(a);
  const [bx, by, bz] = v3c(b);
  switch (axis) {
    case 'x':
      return Math.abs(bx - ax);
    case 'y':
      return Math.abs(by - ay);
    case 'z':
      return Math.abs(bz - az);
    case 'xy': {
      const dx = bx - ax;
      const dy = by - ay;
      return Math.sqrt(dx * dx + dy * dy);
    }
    case 'xz': {
      const dx = bx - ax;
      const dz = bz - az;
      return Math.sqrt(dx * dx + dz * dz);
    }
    case 'xyz':
    default:
      return computeDistance3D(a, b);
  }
}

/**
 * Predict a position at time t given current position, velocity, and optional acceleration.
 */
function predictPosition(
  position: Vector3 | [number, number, number],
  velocity: Vector3 | [number, number, number],
  t: number,
  acceleration?: Vector3 | [number, number, number]
): [number, number, number] {
  const [px, py, pz] = v3c(position);
  const [vx, vy, vz] = v3c(velocity);
  if (acceleration) {
    const [ax, ay, az] = v3c(acceleration);
    return [
      px + vx * t + 0.5 * ax * t * t,
      py + vy * t + 0.5 * ay * t * t,
      pz + vz * t + 0.5 * az * t * t,
    ];
  }
  return [px + vx * t, py + vy * t, pz + vz * t];
}

/**
 * Find the closest point on a line segment AB to point P.
 */
function closestPointOnSegment(
  p: Vector3 | [number, number, number],
  a: Vector3 | [number, number, number],
  b: Vector3 | [number, number, number]
): [number, number, number] {
  const [px, py, pz] = v3c(p);
  const [ax, ay, az] = v3c(a);
  const [bx, by, bz] = v3c(b);
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq === 0) return [ax, ay, az];

  let t = (apx * abx + apy * aby + apz * abz) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  return [ax + t * abx, ay + t * aby, az + t * abz];
}

/**
 * Compute minimum distance from point P to a polyline path.
 */
function distanceToPath(p: Vector3 | [number, number, number], path: Array<Vector3 | [number, number, number]>): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return computeDistance3D(p, path[0]);

  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const closest = closestPointOnSegment(p, path[i], path[i + 1]);
    const dist = computeDistance3D(p, closest);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function emitViolation(
  context: TraitContext,
  kind: SpatialConstraintKind,
  sourceId: string,
  targetId: string,
  message: string,
  currentValue: number,
  requiredValue: number
): void {
  const event: SpatialConstraintViolationEvent = {
    type: 'spatial_constraint_violation',
    constraintKind: kind,
    sourceId,
    targetId,
    message,
    currentValue,
    requiredValue,
    timestamp: Date.now(),
  };
  context.emit('spatial_constraint_violation', event);
}

function emitResolved(
  context: TraitContext,
  kind: SpatialConstraintKind,
  sourceId: string,
  targetId: string
): void {
  const event: SpatialConstraintResolvedEvent = {
    type: 'spatial_constraint_resolved',
    constraintKind: kind,
    sourceId,
    targetId,
    timestamp: Date.now(),
  };
  context.emit('spatial_constraint_resolved', event);
}

// =============================================================================
// INTERNAL STATE INTERFACES
// =============================================================================

interface TemporalAdjacentState {
  /** Whether the adjacency condition is currently met */
  isWithinRange: boolean;
  /** Wall-clock time (seconds since attach) when adjacency was first established */
  adjacentSinceTime: number | null;
  /** Total continuous seconds the entity has been adjacent */
  durationHeld: number;
  /** Whether the duration threshold has been met (constraint satisfied) */
  durationSatisfied: boolean;
  /** When the adjacency was broken (for grace period tracking) */
  brokenSinceTime: number | null;
  /** Whether the constraint is currently violated (after grace period) */
  violated: boolean;
  /** Target position from events */
  targetPosition: Vector3 | null;
  /** Accumulated delta time for tracking */
  elapsedTime: number;
}

interface MovingObstacleData {
  id: string;
  position: Vector3;
  velocity: Vector3;
  radius: number;
}

interface TemporalReachableState {
  violated: boolean;
  isReachable: boolean;
  pathLength: number;
  lastCheckTime: number;
  /** Target position */
  targetPosition: Vector3 | null;
  /** Registered moving obstacles */
  movingObstacles: Map<string, MovingObstacleData>;
  /** Predicted collision time (seconds from now), null if no collision */
  predictedCollisionTime: number | null;
}

interface TrajectoryState {
  violated: boolean;
  lastCheckTime: number;
  /** Source entity velocity */
  velocity: Vector3;
  /** Source entity acceleration (optional) */
  acceleration: Vector3 | null;
  /** Region bounds for keep_in/keep_out */
  regionBounds: { min: Vector3; max: Vector3 } | { center: Vector3; radius: number } | null;
  /** Trajectory sample results from last check */
  lastTrajectory: Vector3[];
  /** Which sample points violated the constraint */
  violatingIndices: number[];
  /** Waypoints reached (for waypoint mode) */
  waypointsReached: boolean[];
}

// =============================================================================
// SPATIAL_TEMPORAL_ADJACENT TRAIT HANDLER
// =============================================================================

/**
 * Runtime handler for the spatial_temporal_adjacent constraint.
 *
 * Extends spatial_adjacent with duration semantics: the adjacency condition
 * must hold continuously for at least `minDuration` seconds. A configurable
 * `gracePeriod` provides hysteresis to prevent rapid violation/resolution
 * flickering.
 *
 * HoloScript usage:
 * ```holoscript
 * orb#guard {
 *   @spatial_temporal_adjacent(
 *     target: "prisoner",
 *     maxDistance: 3m,
 *     minDuration: 5s,
 *     gracePeriod: 1s
 *   )
 * }
 * ```
 */
export const spatialTemporalAdjacentHandler: TraitHandler<SpatialTemporalAdjacentConfig> = {
  name: 'spatial_temporal_adjacent',

  defaultConfig: {
    target: '',
    maxDistance: 5.0,
    minDistance: undefined,
    minDuration: 0,
    gracePeriod: 0,
    axis: 'xyz',
    bidirectional: true,
    soft: false,
    enforcement: 'warn',
  },

  onAttach(node, config, context) {
    const state: TemporalAdjacentState = {
      isWithinRange: false,
      adjacentSinceTime: null,
      durationHeld: 0,
      durationSatisfied: false,
      brokenSinceTime: null,
      violated: false,
      targetPosition: null,
      elapsedTime: 0,
    };
    context.setState({ spatialTemporalAdjacent: state });
  },

  onUpdate(node, config, context, delta) {
    if (!config.target || config.enforcement === 'none') return;

    const state = context.getState().spatialTemporalAdjacent as TemporalAdjacentState | undefined;
    if (!state) return;

    state.elapsedTime += delta;

    const nodePos = node.position || [0, 0, 0];
    const targetPos = state.targetPosition;
    if (!targetPos) return;

    const dist = computeAxisDistance(nodePos, targetPos, config.axis ?? 'xyz');
    const wasViolated = state.violated;

    // Determine if currently within range
    let inRange = dist <= config.maxDistance;
    if (config.minDistance !== undefined && dist < config.minDistance) {
      inRange = false;
    }

    if (inRange) {
      // Reset broken tracking
      state.brokenSinceTime = null;

      if (!state.isWithinRange) {
        // Just entered range
        state.isWithinRange = true;
        state.adjacentSinceTime = state.elapsedTime;
        state.durationHeld = 0;
      } else {
        // Continuing in range
        state.durationHeld = state.elapsedTime - (state.adjacentSinceTime ?? state.elapsedTime);
      }

      // Check if duration threshold is met
      state.durationSatisfied = state.durationHeld >= config.minDuration;

      // If duration is now satisfied and was previously violated, resolve
      if (state.durationSatisfied && state.violated) {
        state.violated = false;
        emitResolved(context, 'spatial_temporal_adjacent', node.id || '', config.target);
      }
    } else {
      // Out of range
      if (state.isWithinRange) {
        // Just broke adjacency
        state.isWithinRange = false;
        state.adjacentSinceTime = null;
        state.durationHeld = 0;
        state.durationSatisfied = false;
        state.brokenSinceTime = state.elapsedTime;
      }

      const gracePeriod = config.gracePeriod ?? 0;
      const brokenDuration =
        state.brokenSinceTime !== null ? state.elapsedTime - state.brokenSinceTime : Infinity;

      // Only violate after grace period
      if (brokenDuration >= gracePeriod && !state.violated) {
        state.violated = true;
        emitViolation(
          context,
          'spatial_temporal_adjacent',
          node.id || '',
          config.target,
          `Entity broke adjacency with '${config.target}' ` +
            `(distance: ${dist.toFixed(2)}m, max: ${config.maxDistance}m) ` +
            `for ${brokenDuration.toFixed(1)}s (grace: ${gracePeriod}s). ` +
            `Duration held: ${state.durationHeld.toFixed(1)}s / ${config.minDuration}s required.`,
          dist,
          config.maxDistance
        );

        // Enforcement: snap back
        if (config.enforcement === 'correct' && dist > config.maxDistance) {
          const ratio = config.maxDistance / dist;
          if (node.position) {
            node.position[0] = targetPos[0] + (nodePos[0] - targetPos[0]) * ratio;
            node.position[1] = targetPos[1] + (nodePos[1] - targetPos[1]) * ratio;
            node.position[2] = targetPos[2] + (nodePos[2] - targetPos[2]) * ratio;
          }
        }
      }
    }

    context.setState({ spatialTemporalAdjacent: state });
  },

  onEvent(node, config, context, event) {
    if (
      event.type === 'spatial_target_update' &&
      (event as Record<string, unknown>).targetId === config.target
    ) {
      const state = context.getState().spatialTemporalAdjacent as TemporalAdjacentState | undefined;
      if (state) {
        state.targetPosition = (event as Record<string, unknown>).position as Vector3;
        context.setState({ spatialTemporalAdjacent: state });
      }
    }
  },
};

// =============================================================================
// SPATIAL_TEMPORAL_REACHABLE TRAIT HANDLER
// =============================================================================

/**
 * Runtime handler for the spatial_temporal_reachable constraint.
 *
 * Extends spatial_reachable with velocity-based obstacle prediction.
 * Moving obstacles are extrapolated forward in time to determine whether
 * the path will remain clear over the prediction horizon.
 *
 * HoloScript usage:
 * ```holoscript
 * orb#drone {
 *   @spatial_temporal_reachable(
 *     target: "landing_pad",
 *     maxPathLength: 100m,
 *     predictionHorizon: 3s,
 *     movingObstacles: ["vehicle", "drone"],
 *     safetyMargin: 1.5m
 *   )
 * }
 * ```
 */
export const spatialTemporalReachableHandler: TraitHandler<SpatialTemporalReachableConfig> = {
  name: 'spatial_temporal_reachable',

  defaultConfig: {
    target: '',
    maxPathLength: undefined,
    predictionHorizon: 3.0,
    movingObstacles: [],
    staticObstacles: [],
    safetyMargin: 0.5,
    algorithm: 'line_of_sight',
    agentRadius: 0.5,
    bidirectional: true,
    soft: false,
    enforcement: 'warn',
  },

  onAttach(node, config, context) {
    const state: TemporalReachableState = {
      violated: false,
      isReachable: true,
      pathLength: 0,
      lastCheckTime: 0,
      targetPosition: null,
      movingObstacles: new Map(),
      predictedCollisionTime: null,
    };
    context.setState({ spatialTemporalReachable: state });
  },

  onUpdate(node, config, context, delta) {
    if (!config.target || config.enforcement === 'none') return;

    const state = context.getState().spatialTemporalReachable as TemporalReachableState | undefined;
    if (!state) return;

    const now = Date.now();
    // Throttle checks to every 250ms (prediction is moderately expensive)
    if (now - state.lastCheckTime < 250) return;
    state.lastCheckTime = now;

    const nodePos = node.position || [0, 0, 0];
    const targetPos = state.targetPosition;
    if (!targetPos) return;

    const straightDist = computeDistance3D(nodePos, targetPos);
    state.pathLength = straightDist;

    const wasReachable = state.isReachable;
    let reachable = true;

    // Check max path length
    if (config.maxPathLength !== undefined && straightDist > config.maxPathLength) {
      reachable = false;
    }

    // Check for predicted collisions with moving obstacles
    if (reachable) {
      const horizon = config.predictionHorizon;
      const safetyMargin = config.safetyMargin ?? 0.5;
      const agentRadius = config.agentRadius ?? 0.5;

      // Direction from source to target (normalized)
      const dx = targetPos[0] - nodePos[0];
      const dy = targetPos[1] - nodePos[1];
      const dz = targetPos[2] - nodePos[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (len > 0) {
        const dirNorm = [dx / len, dy / len, dz / len] as Vector3;

        // Sample time steps across the prediction horizon
        const sampleCount = 10;
        state.predictedCollisionTime = null;

        for (const [, obstacle] of state.movingObstacles) {
          for (let s = 0; s <= sampleCount; s++) {
            const t = (s / sampleCount) * horizon;

            // Predict obstacle position at time t
            const predictedObsPos = predictPosition(obstacle.position, obstacle.velocity, t);

            // Check if predicted obstacle position is within
            // (obstacle.radius + safetyMargin + agentRadius) of the line segment
            const closestPt = closestPointOnSegment(predictedObsPos, nodePos, targetPos);
            const distToPath = computeDistance3D(predictedObsPos, closestPt);
            const clearance = obstacle.radius + safetyMargin + agentRadius;

            if (distToPath < clearance) {
              reachable = false;
              state.predictedCollisionTime = t;
              break;
            }
          }
          if (!reachable) break;
        }
      }
    }

    // Static obstacle check via physics raycast
    if (reachable) {
      const sdx = targetPos[0] - nodePos[0];
      const sdy = targetPos[1] - nodePos[1];
      const sdz = targetPos[2] - nodePos[2];
      const slen = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
      if (slen > 0) {
        const [ox, oy, oz] = v3c(nodePos);
        const hit = context.physics.raycast(
          [ox, oy, oz] as unknown as import('@holoscript/core').Vector3,
          [sdx / slen, sdy / slen, sdz / slen] as unknown as import('@holoscript/core').Vector3,
          slen
        );
        if (hit && hit.distance < slen - 0.01) {
          reachable = false;
        }
      }
    }

    state.isReachable = reachable;
    state.violated = !reachable;

    if (!reachable && wasReachable) {
      const collisionMsg =
        state.predictedCollisionTime !== null
          ? ` Predicted obstacle collision in ${state.predictedCollisionTime.toFixed(1)}s.`
          : '';
      emitViolation(
        context,
        'spatial_temporal_reachable',
        node.id || '',
        config.target,
        `Velocity-predicted path to '${config.target}' is blocked or will be blocked.${collisionMsg}`,
        straightDist,
        config.maxPathLength ?? Infinity
      );
    } else if (reachable && !wasReachable) {
      emitResolved(context, 'spatial_temporal_reachable', node.id || '', config.target);
    }

    context.setState({ spatialTemporalReachable: state });
  },

  onEvent(node, config, context, event) {
    const state = context.getState().spatialTemporalReachable as TemporalReachableState | undefined;
    if (!state) return;

    // Track target position
    if (
      event.type === 'spatial_target_update' &&
      (event as Record<string, unknown>).targetId === config.target
    ) {
      state.targetPosition = (event as Record<string, unknown>).position as Vector3;
      context.setState({ spatialTemporalReachable: state });
    }

    // Track moving obstacle updates
    if (event.type === 'moving_obstacle_update') {
      const data = event as unknown as {
        obstacleId: string;
        position: Vector3;
        velocity: Vector3;
        radius?: number;
      };
      state.movingObstacles.set(data.obstacleId, {
        id: data.obstacleId,
        position: data.position,
        velocity: data.velocity,
        radius: data.radius ?? 0.5,
      });
      context.setState({ spatialTemporalReachable: state });
    }

    // Remove despawned obstacles
    if (event.type === 'obstacle_removed') {
      state.movingObstacles.delete((event as Record<string, unknown>).obstacleId as string);
      context.setState({ spatialTemporalReachable: state });
    }
  },
};

// =============================================================================
// SPATIAL_TRAJECTORY TRAIT HANDLER
// =============================================================================

/**
 * Runtime handler for the spatial_trajectory constraint.
 *
 * Predicts the entity's future trajectory based on position, velocity,
 * and optional acceleration, then validates it against spatial constraints:
 * - keep_in:   all sample points must remain inside a region
 * - keep_out:  all sample points must remain outside a region
 * - follow:    all sample points must stay within maxDeviation of a reference path
 * - waypoint:  the trajectory must pass through specified waypoints
 *
 * HoloScript usage:
 * ```holoscript
 * orb#missile {
 *   @spatial_trajectory(
 *     mode: "keep_in",
 *     regionId: "safe_corridor",
 *     horizon: 5s,
 *     sampleCount: 20
 *   )
 * }
 * ```
 */
export const spatialTrajectoryHandler: TraitHandler<SpatialTrajectoryConfig> = {
  name: 'spatial_trajectory',

  defaultConfig: {
    mode: 'keep_in',
    regionId: undefined,
    horizon: 3.0,
    sampleCount: 10,
    maxDeviation: 1.0,
    waypoints: undefined,
    referencePath: undefined,
    useAcceleration: false,
    soft: false,
    enforcement: 'warn',
  },

  onAttach(node, config, context) {
    const state: TrajectoryState = {
      violated: false,
      lastCheckTime: 0,
      velocity: [0, 0, 0],
      acceleration: null,
      regionBounds: null,
      lastTrajectory: [],
      violatingIndices: [],
      waypointsReached: config.waypoints ? new Array(config.waypoints.length).fill(false) : [],
    };
    context.setState({ spatialTrajectory: state });
  },

  onUpdate(node, config, context, delta) {
    if (config.enforcement === 'none') return;

    const state = context.getState().spatialTrajectory as TrajectoryState | undefined;
    if (!state) return;

    const now = Date.now();
    // Throttle checks to every 100ms (trajectory prediction needs freshness)
    if (now - state.lastCheckTime < 100) return;
    state.lastCheckTime = now;

    const nodePos = node.position || [0, 0, 0];
    const sampleCount = config.sampleCount ?? 10;
    const horizon = config.horizon;

    // Compute trajectory samples
    const trajectory: Vector3[] = [];
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * horizon;
      const pt =
        config.useAcceleration && state.acceleration
          ? predictPosition(nodePos, state.velocity, t, state.acceleration)
          : predictPosition(nodePos, state.velocity, t);
      trajectory.push(pt);
    }
    state.lastTrajectory = trajectory;

    const wasViolated = state.violated;
    let isViolated = false;
    state.violatingIndices = [];

    switch (config.mode) {
      case 'keep_in':
        isViolated = this._checkKeepIn(trajectory, state, config);
        break;
      case 'keep_out':
        isViolated = this._checkKeepOut(trajectory, state, config);
        break;
      case 'follow':
        isViolated = this._checkFollow(trajectory, state, config);
        break;
      case 'waypoint':
        isViolated = this._checkWaypoints(trajectory, state, config);
        break;
    }

    state.violated = isViolated;

    if (isViolated && !wasViolated) {
      const modeDesc = {
        keep_in: 'predicted to leave region',
        keep_out: 'predicted to enter forbidden region',
        follow: 'predicted to deviate from reference path',
        waypoint: 'predicted to miss waypoints',
      };
      emitViolation(
        context,
        'spatial_trajectory',
        node.id || '',
        config.regionId || '',
        `Trajectory ${modeDesc[config.mode]}. ` +
          `${state.violatingIndices.length} of ${sampleCount + 1} sample points violate the constraint.`,
        state.violatingIndices.length,
        0
      );
    } else if (!isViolated && wasViolated) {
      emitResolved(context, 'spatial_trajectory', node.id || '', config.regionId || '');
    }

    context.setState({ spatialTrajectory: state });
  },

  // ---- Internal mode-specific checks ----

  /** Check keep_in: all trajectory points must be inside the region bounds. */
  _checkKeepIn(
    trajectory: Vector3[],
    state: TrajectoryState,
    _config: SpatialTrajectoryConfig
  ): boolean {
    if (!state.regionBounds) return false;

    let anyViolation = false;
    const bounds = state.regionBounds;

    for (let i = 0; i < trajectory.length; i++) {
      const pt = trajectory[i];
      let inside: boolean;

      if ('radius' in bounds) {
        const dist = computeDistance3D(pt, bounds.center);
        inside = dist <= bounds.radius;
      } else {
        inside =
          pt[0] >= bounds.min[0] &&
          pt[0] <= bounds.max[0] &&
          pt[1] >= bounds.min[1] &&
          pt[1] <= bounds.max[1] &&
          pt[2] >= bounds.min[2] &&
          pt[2] <= bounds.max[2];
      }

      if (!inside) {
        anyViolation = true;
        state.violatingIndices.push(i);
      }
    }

    return anyViolation;
  },

  /** Check keep_out: all trajectory points must be outside the region bounds. */
  _checkKeepOut(
    trajectory: Vector3[],
    state: TrajectoryState,
    _config: SpatialTrajectoryConfig
  ): boolean {
    if (!state.regionBounds) return false;

    let anyViolation = false;
    const bounds = state.regionBounds;

    for (let i = 0; i < trajectory.length; i++) {
      const pt = trajectory[i];
      let inside: boolean;

      if ('radius' in bounds) {
        const dist = computeDistance3D(pt, bounds.center);
        inside = dist <= bounds.radius;
      } else {
        inside =
          pt[0] >= bounds.min[0] &&
          pt[0] <= bounds.max[0] &&
          pt[1] >= bounds.min[1] &&
          pt[1] <= bounds.max[1] &&
          pt[2] >= bounds.min[2] &&
          pt[2] <= bounds.max[2];
      }

      if (inside) {
        anyViolation = true;
        state.violatingIndices.push(i);
      }
    }

    return anyViolation;
  },

  /** Check follow: all trajectory points must be within maxDeviation of reference path. */
  _checkFollow(
    trajectory: Vector3[],
    state: TrajectoryState,
    config: SpatialTrajectoryConfig
  ): boolean {
    const refPath = config.referencePath;
    if (!refPath || refPath.length === 0) return false;

    const maxDev = config.maxDeviation ?? 1.0;
    let anyViolation = false;

    for (let i = 0; i < trajectory.length; i++) {
      const dev = distanceToPath(trajectory[i], refPath);
      if (dev > maxDev) {
        anyViolation = true;
        state.violatingIndices.push(i);
      }
    }

    return anyViolation;
  },

  /** Check waypoints: trajectory must pass within acceptance radius of each waypoint. */
  _checkWaypoints(
    trajectory: Vector3[],
    state: TrajectoryState,
    config: SpatialTrajectoryConfig
  ): boolean {
    const waypoints = config.waypoints;
    if (!waypoints || waypoints.length === 0) return false;

    // Check which waypoints the trajectory passes through
    for (let w = 0; w < waypoints.length; w++) {
      const wp = waypoints[w];
      for (const pt of trajectory) {
        const dist = computeDistance3D(pt, wp.position);
        if (dist <= wp.radius) {
          state.waypointsReached[w] = true;
          break;
        }
      }
    }

    // Violation if any waypoints are not reached
    const missedCount = state.waypointsReached.filter((r) => !r).length;
    if (missedCount > 0) {
      // Mark missed waypoint indices as violating
      for (let w = 0; w < state.waypointsReached.length; w++) {
        if (!state.waypointsReached[w]) {
          state.violatingIndices.push(w);
        }
      }
      return true;
    }

    return false;
  },

  onEvent(node, config, context, event) {
    const state = context.getState().spatialTrajectory as TrajectoryState | undefined;
    if (!state) return;

    // Update velocity from physics
    if (event.type === 'velocity_update') {
      state.velocity = (event as Record<string, unknown>).velocity as Vector3;
      if ((event as Record<string, unknown>).acceleration) {
        state.acceleration = (event as Record<string, unknown>).acceleration as Vector3;
      }
      context.setState({ spatialTrajectory: state });
    }

    // Update region bounds
    if (event.type === 'region_bounds_update') {
      const data = event as unknown as {
        regionId: string;
        bounds: { min: Vector3; max: Vector3 } | { center: Vector3; radius: number } | null;
      };
      if (data.regionId === config.regionId) {
        state.regionBounds = data.bounds;
        context.setState({ spatialTrajectory: state });
      }
    }
  },
} as TraitHandler<SpatialTrajectoryConfig> & {
  _checkKeepIn: (
    trajectory: Vector3[],
    state: TrajectoryState,
    config: SpatialTrajectoryConfig
  ) => boolean;
  _checkKeepOut: (
    trajectory: Vector3[],
    state: TrajectoryState,
    config: SpatialTrajectoryConfig
  ) => boolean;
  _checkFollow: (
    trajectory: Vector3[],
    state: TrajectoryState,
    config: SpatialTrajectoryConfig
  ) => boolean;
  _checkWaypoints: (
    trajectory: Vector3[],
    state: TrajectoryState,
    config: SpatialTrajectoryConfig
  ) => boolean;
};

// =============================================================================
// EXPORTED UTILITY FUNCTIONS (for testing)
// =============================================================================

export { predictPosition, closestPointOnSegment, distanceToPath };
