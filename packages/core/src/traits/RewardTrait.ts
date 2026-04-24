/**
 * Grounded Reward Shaping Trait
 *
 * Enables scene-based reinforcement learning by defining reward functions
 * that map physical simulation state (positions, velocities, collisions) to
 * scalar reward signals. Rewards are tied to observable scene outcomes,
 * making them "grounded" in simulation semantics.
 *
 * Reward functions support:
 *   - Distance-based rewards (minimize/maximize distance to target)
 *   - Collision detection (reward for contact events)
 *   - Velocity/momentum rewards
 *   - State-change triggers (cross thresholds)
 *   - Multi-objective composition (weighted sum)
 *
 * Agents observe reward signals via @reactive bindings to `reward:signal`
 * and can feed signals to their motivation architecture.
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';

export type RewardEventType =
  | 'distance' // Distance to target
  | 'collision' // Contact event
  | 'velocity' // Magnitude-based
  | 'state_change' // Threshold crossing
  | 'time' // Time-based penalty/bonus
  | 'composite'; // Multi-objective

export interface RewardEventDef {
  type: RewardEventType;
  weight: number; // [0, 1] — contribution to total reward
  config: Record<string, any>;
  // For 'distance': { targetObjectId: string, maxDist: number }
  // For 'collision': { withObjectId?: string, enabled: boolean }
  // For 'velocity': { minVel: number, maxVel: number, scale: number }
  // For 'state_change': { property: string, threshold: number, direction: 'above'|'below' }
  // For 'time': { penalty: number, maxSteps: number }
  // For 'composite': { events: RewardEventDef[] }
}

export interface RewardShapeConfig {
  events: RewardEventDef[]; // Ordered list of reward contributors
  normalizeReward?: boolean; // Scale reward to [-1, 1]
  decayFactor?: number; // Discount factor per timestep (for temporal reward shaping)
  resetOnCollision?: boolean; // Reset accumulated reward on collision
  verbose?: boolean; // Log reward calculations
}

interface RewardState {
  accumulatedReward: number;
  lastSignal: number; // Most recent reward signal
  timestep: number;
  collisionThisFrame: boolean;
  previousPositions: Map<string, [number, number, number]>;
  eventScores: Map<string, number>; // Per-event accumulated score
}

function toVec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [x, y, z] = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  return [x, y, z];
}

function resolveTargetPosition(
  targetId: string,
  context: any
): [number, number, number] | null {
  if (!targetId) return null;

  const physicsPos = toVec3(context?.physics?.getBodyPosition?.(targetId));
  if (physicsPos) return physicsPos;

  const state = context?.getState?.();
  const sceneNodePos =
    toVec3(state?.scene?.nodes?.[targetId]?.position) ||
    toVec3(state?.nodes?.[targetId]?.position) ||
    toVec3(state?.objects?.[targetId]?.position);

  if (sceneNodePos) return sceneNodePos;

  return null;
}

/**
 * RewardTrait
 *
 * Attached to a scene object, computes reward signals based on configured
 * events. Updates `reward:signal` observable every frame.
 */
export const rewardTraitHandler: TraitHandler<RewardShapeConfig> = {
  name: '@reward',

  defaultConfig: {
    events: [
      {
        type: 'distance',
        weight: 1.0,
        config: { targetObjectId: '', maxDist: 10.0 },
      },
    ],
    normalizeReward: true,
    decayFactor: 0.99,
    resetOnCollision: false,
    verbose: false,
  },

  onAttach(node: HSPlusNode, config: RewardShapeConfig, context: any) {
    const state: RewardState = {
      accumulatedReward: 0,
      lastSignal: 0,
      timestep: 0,
      collisionThisFrame: false,
      previousPositions: new Map(),
      eventScores: new Map(),
    };

    // Initialize event score trackers
    for (const event of config.events) {
      state.eventScores.set(`event_${config.events.indexOf(event)}`, 0);
    }

    context.data = state;

    // Initialize observable at 0
    if (context.reactive) {
      context.reactive.set('reward:signal', 0);
      context.reactive.set('reward:accumulated', 0);
      context.reactive.set('reward:events', {});
    }

    if (config.verbose) {
      console.log(`[Reward] Attached to ${node.id} with ${config.events.length} event(s)`);
    }
  },

  onDetach(node: HSPlusNode) {
    // Cleanup
  },

  onUpdate(node: HSPlusNode, config: RewardShapeConfig, context: any, deltaTime: number) {
    const state: RewardState = context.data;

    // Get current position (assuming physics trait provides position)
    const currentPos = node.position as [number, number, number] | undefined;
    if (!currentPos) return; // No position — no reward

    state.collisionThisFrame = false;
    state.timestep++;

    let frameReward = 0;
    const eventScores: Record<string, number> = {};

    // Evaluate each reward event
    for (let i = 0; i < config.events.length; i++) {
      const event = config.events[i];
      let eventReward = 0;

      switch (event.type) {
        case 'distance': {
          // Reward based on distance to target object
          const targetId = event.config.targetObjectId as string;
          const maxDist = (event.config.maxDist as number) ?? 10;

          // Resolve target from physics scene first, then state snapshots.
          // Fall back to origin to preserve legacy behavior when unresolved.
          const targetPos = resolveTargetPosition(targetId, context) ?? ([0, 0, 0] as [number, number, number]);

          const dx = currentPos[0] - targetPos[0];
          const dy = currentPos[1] - targetPos[1];
          const dz = currentPos[2] - targetPos[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          // Linear reward decay: 1.0 at dist=0, 0.0 at dist=maxDist, negative beyond
          eventReward = Math.max(-1, 1.0 - dist / maxDist);
          break;
        }

        case 'collision': {
          // Reward / penalty for contact events
          // In full implementation, query physics world for contacts
          eventReward = state.collisionThisFrame ? (event.config.reward ?? 0.1) : 0;
          break;
        }

        case 'velocity': {
          // Reward based on velocity magnitude
          const velocity = (context.physicsBody?.getVelocity?.() ?? [0, 0, 0]) as [
            number,
            number,
            number,
          ];
          const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
          const minVel = (event.config.minVel as number) ?? 0;
          const maxVel = (event.config.maxVel as number) ?? 10;

          // Reward if velocity is in target range
          eventReward =
            speed >= minVel && speed <= maxVel ? 1.0 : -0.1 * Math.abs(speed - maxVel);
          break;
        }

        case 'state_change': {
          // Reward for crossing thresholds on observable properties
          const prop = event.config.property as string;
          const threshold = (event.config.threshold as number) ?? 0;
          const direction = (event.config.direction as 'above' | 'below') ?? 'above';

          const propValue = (node as any)[prop] ?? 0;
          const crosses =
            direction === 'above'
              ? propValue >= threshold
              : direction === 'below'
                ? propValue <= threshold
                : false;

          eventReward = crosses ? 1.0 : -0.05;
          break;
        }

        case 'time': {
          // Time-based penalty / bonus
          const penalty = (event.config.penalty as number) ?? 0.01;
          eventReward = -penalty; // Small negative per frame encourages speed
          break;
        }

        case 'composite': {
          // Recursively evaluate sub-events
          // (simplified — full implementation would recurse)
          eventReward = 0;
          break;
        }
      }

      eventScores[`event_${i}`] = eventReward;
      frameReward += eventReward * event.weight;
    }

    // Normalize reward if requested
    if (config.normalizeReward && config.events.length > 0) {
      frameReward = frameReward / config.events.length;
    }

    // Apply temporal discount
    state.accumulatedReward *= config.decayFactor ?? 0.99;
    state.accumulatedReward += frameReward;

    // Reset on collision if configured
    if (config.resetOnCollision && state.collisionThisFrame) {
      state.accumulatedReward = 0;
    }

    state.lastSignal = frameReward;

    // Update observables for @reactive binding
    if (context.reactive) {
      context.reactive.set('reward:signal', frameReward);
      context.reactive.set('reward:accumulated', state.accumulatedReward);
      context.reactive.set('reward:events', eventScores);
    }

    if (config.verbose) {
      console.log(
        `[Reward] Step ${state.timestep}: signal=${frameReward.toFixed(3)}, accumulated=${state.accumulatedReward.toFixed(3)}`
      );
    }
  },

  onEvent(node: HSPlusNode, config: RewardShapeConfig, context: any, event: any) {
    const state: RewardState = context.data;

    if (event.type === 'collision') {
      state.collisionThisFrame = true;
    }
  },
};

export default rewardTraitHandler;
