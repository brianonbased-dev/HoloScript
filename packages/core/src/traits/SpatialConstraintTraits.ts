/**
 * Spatial Constraint Traits
 *
 * Runtime trait handler implementations for the three spatial constraint
 * families: spatial_adjacent, spatial_contains, and spatial_reachable.
 *
 * These traits enforce spatial relationships at runtime, complementing
 * the compile-time verification provided by SpatialConstraintValidator.
 *
 * @version 1.0.0
 * @module traits/SpatialConstraintTraits
 */

import type { TraitHandler } from './TraitTypes';
import type {
  SpatialAdjacentConfig,
  SpatialContainsConfig,
  SpatialReachableConfig,
  SpatialEnforcementMode,
  SpatialConstraintViolationEvent,
  SpatialConstraintResolvedEvent,
  SpatialConstraintKind,
} from '../spatial/SpatialConstraintTypes';

// =============================================================================
// SHARED STATE & HELPERS
// =============================================================================

interface ConstraintViolation {
  violated: boolean;
  currentValue: number;
  requiredValue: number;
  lastChecked: number;
}

interface AdjacentState {
  violation: ConstraintViolation;
  targetPosition: { x: number; y: number; z: number } | null;
}

interface ContainsState {
  violation: ConstraintViolation;
  containedEntities: string[];
}

interface ReachableState {
  violation: ConstraintViolation;
  lastPathCheck: number;
  isReachable: boolean;
  pathLength: number;
}

function computeDistance3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computeAxisDistance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  axis: string
): number {
  switch (axis) {
    case 'x':
      return Math.abs(b.x - a.x);
    case 'y':
      return Math.abs(b.y - a.y);
    case 'z':
      return Math.abs(b.z - a.z);
    case 'xy': {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    case 'xz': {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      return Math.sqrt(dx * dx + dz * dz);
    }
    case 'xyz':
    default:
      return computeDistance3D(a, b);
  }
}

function emitViolation(
  context: any,
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
  context: any,
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
// SPATIAL_ADJACENT TRAIT HANDLER
// =============================================================================

/**
 * Runtime handler for the spatial_adjacent constraint.
 *
 * Monitors distance between the host entity and a target entity,
 * emitting events and optionally correcting violations.
 *
 * HoloScript usage:
 * ```holoscript
 * orb#shelf {
 *   @spatial_adjacent(target: "book", maxDistance: 1.5, axis: "xz")
 * }
 * ```
 */
export const spatialAdjacentHandler: TraitHandler<SpatialAdjacentConfig> = {
  name: 'spatial_adjacent' as any,

  defaultConfig: {
    target: '',
    maxDistance: 5.0,
    minDistance: undefined,
    axis: 'xyz',
    bidirectional: true,
    soft: false,
    enforcement: 'warn',
  },

  onAttach(node, config, context) {
    const state: AdjacentState = {
      violation: {
        violated: false,
        currentValue: 0,
        requiredValue: config.maxDistance,
        lastChecked: 0,
      },
      targetPosition: null,
    };
    context.setState({ spatialAdjacent: state });
  },

  onUpdate(node, config, context, delta) {
    if (!config.target || config.enforcement === 'none') return;

    const state = context.getState().spatialAdjacent as AdjacentState | undefined;
    if (!state) return;

    // Get positions from context
    const nodePos = node.position || { x: 0, y: 0, z: 0 };
    const targetPos = state.targetPosition;
    if (!targetPos) return;

    const dist = computeAxisDistance(nodePos, targetPos, config.axis ?? 'xyz');
    state.violation.currentValue = dist;
    state.violation.lastChecked = Date.now();

    const wasViolated = state.violation.violated;
    let isViolated = false;

    // Check max distance
    if (dist > config.maxDistance) {
      isViolated = true;
    }

    // Check min distance
    if (config.minDistance !== undefined && dist < config.minDistance) {
      isViolated = true;
    }

    state.violation.violated = isViolated;

    if (isViolated && !wasViolated) {
      emitViolation(
        context,
        'spatial_adjacent',
        node.id || '',
        config.target,
        `Entity is ${dist.toFixed(2)}m from '${config.target}' (max: ${config.maxDistance}m)`,
        dist,
        config.maxDistance
      );

      // Enforcement
      if (config.enforcement === 'correct' && dist > config.maxDistance) {
        // Snap toward target
        const ratio = config.maxDistance / dist;
        const corrected = {
          x: targetPos.x + (nodePos.x - targetPos.x) * ratio,
          y: targetPos.y + (nodePos.y - targetPos.y) * ratio,
          z: targetPos.z + (nodePos.z - targetPos.z) * ratio,
        };
        if (node.position) {
          node.position.x = corrected.x;
          node.position.y = corrected.y;
          node.position.z = corrected.z;
        }
      }
    } else if (!isViolated && wasViolated) {
      emitResolved(context, 'spatial_adjacent', node.id || '', config.target);
    }

    context.setState({ spatialAdjacent: state });
  },

  onEvent(node, config, context, event) {
    // Listen for target position updates
    if (
      event.type === 'spatial_target_update' &&
      (event as any).targetId === config.target
    ) {
      const state = context.getState().spatialAdjacent as AdjacentState | undefined;
      if (state) {
        state.targetPosition = (event as any).position;
        context.setState({ spatialAdjacent: state });
      }
    }
  },
};

// =============================================================================
// SPATIAL_CONTAINS TRAIT HANDLER
// =============================================================================

/**
 * Runtime handler for the spatial_contains constraint.
 *
 * Monitors whether contained entities remain within the host entity's
 * bounding volume, emitting events and optionally correcting violations.
 *
 * HoloScript usage:
 * ```holoscript
 * orb#room {
 *   @spatial_contains(target: "furniture", margin: 0.1, strict: true)
 * }
 * ```
 */
export const spatialContainsHandler: TraitHandler<SpatialContainsConfig> = {
  name: 'spatial_contains' as any,

  defaultConfig: {
    target: '',
    margin: 0,
    strict: false,
    recursive: false,
    soft: false,
    enforcement: 'warn',
  },

  onAttach(node, config, context) {
    const state: ContainsState = {
      violation: {
        violated: false,
        currentValue: 0,
        requiredValue: 0,
        lastChecked: 0,
      },
      containedEntities: [],
    };
    context.setState({ spatialContains: state });
  },

  onUpdate(node, config, context, delta) {
    if (!config.target || config.enforcement === 'none') return;

    const state = context.getState().spatialContains as ContainsState | undefined;
    if (!state) return;

    // Container bounds from node
    const nodeBounds = (node as any).bounds;
    if (!nodeBounds) return;

    const nodePos = node.position || { x: 0, y: 0, z: 0 };
    const margin = config.margin ?? 0;

    // Check each contained entity
    let anyViolation = false;

    for (const containedId of state.containedEntities) {
      const containedPos = (context.getState() as any)[`entity_pos_${containedId}`];
      if (!containedPos) continue;

      let isInside = false;

      if ('radius' in nodeBounds) {
        // Sphere containment
        const dist = computeDistance3D(containedPos, nodeBounds.center);
        isInside = dist <= nodeBounds.radius - margin;
        state.violation.currentValue = dist;
        state.violation.requiredValue = nodeBounds.radius - margin;
      } else if (nodeBounds.min && nodeBounds.max) {
        // Box containment
        isInside =
          containedPos.x >= nodeBounds.min.x + margin &&
          containedPos.x <= nodeBounds.max.x - margin &&
          containedPos.y >= nodeBounds.min.y + margin &&
          containedPos.y <= nodeBounds.max.y - margin &&
          containedPos.z >= nodeBounds.min.z + margin &&
          containedPos.z <= nodeBounds.max.z - margin;
      }

      if (!isInside) {
        anyViolation = true;

        emitViolation(
          context,
          'spatial_contains',
          node.id || '',
          containedId,
          `Entity '${containedId}' has exited container '${node.id}'`,
          state.violation.currentValue,
          state.violation.requiredValue
        );

        // Enforcement: clamp position to container bounds
        if (config.enforcement === 'correct' && nodeBounds.min && nodeBounds.max) {
          const clamped = {
            x: Math.max(
              nodeBounds.min.x + margin,
              Math.min(nodeBounds.max.x - margin, containedPos.x)
            ),
            y: Math.max(
              nodeBounds.min.y + margin,
              Math.min(nodeBounds.max.y - margin, containedPos.y)
            ),
            z: Math.max(
              nodeBounds.min.z + margin,
              Math.min(nodeBounds.max.z - margin, containedPos.z)
            ),
          };
          context.setState({ [`entity_pos_${containedId}`]: clamped });
        }
      }
    }

    const wasViolated = state.violation.violated;
    state.violation.violated = anyViolation;
    state.violation.lastChecked = Date.now();

    if (!anyViolation && wasViolated) {
      emitResolved(context, 'spatial_contains', node.id || '', config.target);
    }

    context.setState({ spatialContains: state });
  },

  onEvent(node, config, context, event) {
    // Track contained entity registration
    if (event.type === 'spatial_entity_registered') {
      const state = context.getState().spatialContains as ContainsState | undefined;
      if (state) {
        const entityId = (event as any).entityId as string;
        const entityType = (event as any).entityType as string;
        if (entityId === config.target || entityType === config.target) {
          if (!state.containedEntities.includes(entityId)) {
            state.containedEntities.push(entityId);
            context.setState({ spatialContains: state });
          }
        }
      }
    }

    // Track contained entity position updates
    if (event.type === 'spatial_target_update') {
      const targetId = (event as any).targetId as string;
      const position = (event as any).position;
      if (position) {
        context.setState({ [`entity_pos_${targetId}`]: position });
      }
    }
  },
};

// =============================================================================
// SPATIAL_REACHABLE TRAIT HANDLER
// =============================================================================

/**
 * Runtime handler for the spatial_reachable constraint.
 *
 * Periodically checks whether an unobstructed path exists from the
 * host entity to a target entity, emitting events on state changes.
 *
 * HoloScript usage:
 * ```holoscript
 * orb#npc {
 *   @spatial_reachable(
 *     target: "exit_door",
 *     maxPathLength: 50,
 *     algorithm: "line_of_sight"
 *   )
 * }
 * ```
 */
export const spatialReachableHandler: TraitHandler<SpatialReachableConfig> = {
  name: 'spatial_reachable' as any,

  defaultConfig: {
    target: '',
    maxPathLength: undefined,
    obstacleTypes: [],
    algorithm: 'line_of_sight',
    agentRadius: 0.5,
    bidirectional: true,
    soft: false,
    enforcement: 'warn',
  },

  onAttach(node, config, context) {
    const state: ReachableState = {
      violation: {
        violated: false,
        currentValue: 0,
        requiredValue: config.maxPathLength ?? Infinity,
        lastChecked: 0,
      },
      lastPathCheck: 0,
      isReachable: true,
      pathLength: 0,
    };
    context.setState({ spatialReachable: state });
  },

  onUpdate(node, config, context, delta) {
    if (!config.target || config.enforcement === 'none') return;

    const state = context.getState().spatialReachable as ReachableState | undefined;
    if (!state) return;

    const now = Date.now();
    // Throttle reachability checks to every 500ms (pathfinding is expensive)
    if (now - state.lastPathCheck < 500) return;
    state.lastPathCheck = now;

    const nodePos = node.position || { x: 0, y: 0, z: 0 };
    const targetPos = (context.getState() as any)[`reachable_target_${config.target}`];
    if (!targetPos) return;

    // Simple line-of-sight check (default algorithm)
    const dist = computeDistance3D(nodePos, targetPos);
    state.pathLength = dist;
    state.violation.currentValue = dist;
    state.violation.lastChecked = now;

    const wasReachable = state.isReachable;

    // Check path length
    if (config.maxPathLength !== undefined && dist > config.maxPathLength) {
      state.isReachable = false;
    } else {
      // For line_of_sight, use physics raycast if available
      if (config.algorithm === 'line_of_sight') {
        const direction = {
          x: targetPos.x - nodePos.x,
          y: targetPos.y - nodePos.y,
          z: targetPos.z - nodePos.z,
        };
        const len = Math.sqrt(
          direction.x * direction.x +
          direction.y * direction.y +
          direction.z * direction.z
        );
        if (len > 0) {
          const normalized = {
            x: direction.x / len,
            y: direction.y / len,
            z: direction.z / len,
          };
          const hit = context.physics.raycast(nodePos, normalized, dist);
          state.isReachable = !hit || hit.distance >= dist - 0.01;
        } else {
          state.isReachable = true;
        }
      } else {
        // For navmesh/astar, assume reachable unless overridden by event
        state.isReachable = true;
      }
    }

    state.violation.violated = !state.isReachable;

    if (!state.isReachable && wasReachable) {
      emitViolation(
        context,
        'spatial_reachable',
        node.id || '',
        config.target,
        `Path to '${config.target}' is blocked or exceeds max length`,
        dist,
        config.maxPathLength ?? Infinity
      );
    } else if (state.isReachable && !wasReachable) {
      emitResolved(context, 'spatial_reachable', node.id || '', config.target);
    }

    context.setState({ spatialReachable: state });
  },

  onEvent(node, config, context, event) {
    // Track target position for reachability
    if (
      event.type === 'spatial_target_update' &&
      (event as any).targetId === config.target
    ) {
      context.setState({
        [`reachable_target_${config.target}`]: (event as any).position,
      });
    }

    // External pathfinding result (for navmesh/astar algorithms)
    if (event.type === 'pathfinding_result') {
      const result = event as any;
      if (result.targetId === config.target) {
        const state = context.getState().spatialReachable as ReachableState | undefined;
        if (state) {
          state.isReachable = result.pathFound === true;
          state.pathLength = result.pathLength ?? state.pathLength;
          state.violation.violated = !state.isReachable;
          context.setState({ spatialReachable: state });
        }
      }
    }
  },
};
