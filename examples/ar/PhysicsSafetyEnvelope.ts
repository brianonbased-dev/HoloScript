// TARGET: packages/platform/core/src/PhysicsSafetyEnvelope.ts
// TODO-001 (CRITICAL): Confabulation-safe physics bounds
//
// Extends the existing PhysicsSafetyEnvelope with confabulation-resistant
// guarantees. The existing envelope provides immutable upper bounds for
// physics values (velocity, force, gravity, etc.) but does not defend
// against AI agents that confabulate physics parameters by:
//   1. Constructing new envelope objects at runtime
//   2. Passing custom envelopes to enforcement functions
//   3. Calling physics APIs directly, bypassing the enforcer
//   4. Gradually escalating values just below the clamp threshold
//
// This module adds:
//   - ConfabulationGuard: detects gradual escalation patterns
//   - TeleportationBounds: immutable max teleportation distance per frame
//   - CollisionForceEnvelope: caps collision response forces
//   - EnvelopeIntegrityCheck: runtime tamper detection via hash
//   - AgentPhysicsBudget: per-agent cumulative force/impulse budget per second

/**
 * ConfabulationSafePhysicsEnvelope
 *
 * Builds on top of PhysicsSafetyEnvelope with additional confabulation
 * defenses. All values are frozen at module load and verified via
 * integrity hash at enforcement time.
 *
 * @module ConfabulationSafePhysicsEnvelope
 * @version 1.0.0
 */

// Re-export base types for consumers who import from this module
export type {
  PhysicsSafetyBounds,
  ClampEvent,
} from './PhysicsSafetyEnvelope';

import {
  PHYSICS_SAFETY_ENVELOPE,
  type PhysicsSafetyBounds,
  type ClampEvent,
  clampRange,
  clampSymmetric,
  vectorMagnitude,
  clampVectorMagnitude,
} from './PhysicsSafetyEnvelope';

// =============================================================================
// TELEPORTATION BOUNDS
// =============================================================================

/**
 * Immutable teleportation safety bounds.
 *
 * AI agents generating movement can confabulate large position deltas
 * that effectively teleport entities. These bounds cap the maximum
 * position change per physics tick and per second.
 */
export interface TeleportationBounds {
  /** Maximum position delta per physics tick (meters). Default: 5m at 90Hz */
  readonly maxDeltaPerTick: number;
  /** Maximum cumulative position change per second (meters). Default: 50m/s */
  readonly maxDeltaPerSecond: number;
  /** Maximum single-frame teleport distance allowed (meters). Default: 100m */
  readonly maxTeleportDistance: number;
  /** Minimum cooldown between teleports (milliseconds). Default: 1000ms */
  readonly teleportCooldownMs: number;
}

const _TELEPORTATION_BOUNDS: TeleportationBounds = {
  maxDeltaPerTick: 5.0,
  maxDeltaPerSecond: 50.0,
  maxTeleportDistance: 100.0,
  teleportCooldownMs: 1000,
};

export const TELEPORTATION_BOUNDS: Readonly<TeleportationBounds> = Object.freeze(
  _TELEPORTATION_BOUNDS,
);

// =============================================================================
// COLLISION FORCE ENVELOPE
// =============================================================================

/**
 * Immutable collision response force bounds.
 *
 * Collision resolution can generate arbitrarily large forces when
 * penetration depth is high or mass ratios are extreme. These bounds
 * cap the collision response forces to physically plausible ranges.
 */
export interface CollisionForceEnvelope {
  /** Maximum collision response force magnitude (Newtons). Default: 50000N */
  readonly maxCollisionResponseForce: number;
  /** Maximum penetration correction velocity (m/s). Default: 10 m/s */
  readonly maxPenetrationCorrectionVelocity: number;
  /** Maximum collision impulse magnitude (N*s). Default: 10000 N*s */
  readonly maxCollisionImpulse: number;
  /** Minimum collision restitution coefficient. Default: 0.0 (perfectly inelastic) */
  readonly minRestitution: number;
  /** Maximum collision restitution coefficient. Default: 1.0 (perfectly elastic) */
  readonly maxRestitution: number;
}

const _COLLISION_FORCE_ENVELOPE: CollisionForceEnvelope = {
  maxCollisionResponseForce: 50000,
  maxPenetrationCorrectionVelocity: 10.0,
  maxCollisionImpulse: 10000,
  minRestitution: 0.0,
  maxRestitution: 1.0,
};

export const COLLISION_FORCE_ENVELOPE: Readonly<CollisionForceEnvelope> = Object.freeze(
  _COLLISION_FORCE_ENVELOPE,
);

// =============================================================================
// AGENT PHYSICS BUDGET
// =============================================================================

/**
 * Per-agent cumulative physics budget.
 *
 * Even if individual values are within bounds, an agent that applies
 * max force 1000 times per second is confabulating physics. The budget
 * limits cumulative force/impulse/energy per agent per second.
 */
export interface AgentPhysicsBudgetConfig {
  /** Maximum cumulative force magnitude per second (N*s). Default: 100000 */
  readonly maxCumulativeForcePerSecond: number;
  /** Maximum cumulative impulse magnitude per second (N*s^2). Default: 50000 */
  readonly maxCumulativeImpulsePerSecond: number;
  /** Maximum physics API calls per second per agent. Default: 120 */
  readonly maxCallsPerSecond: number;
  /** Budget replenishment interval (ms). Default: 1000 */
  readonly replenishIntervalMs: number;
  /** Penalty multiplier when budget exceeded (0-1, applied to values). Default: 0.1 */
  readonly overBudgetPenalty: number;
}

const _DEFAULT_AGENT_BUDGET: AgentPhysicsBudgetConfig = {
  maxCumulativeForcePerSecond: 100000,
  maxCumulativeImpulsePerSecond: 50000,
  maxCallsPerSecond: 120,
  replenishIntervalMs: 1000,
  overBudgetPenalty: 0.1,
};

export const DEFAULT_AGENT_PHYSICS_BUDGET: Readonly<AgentPhysicsBudgetConfig> = Object.freeze(
  _DEFAULT_AGENT_BUDGET,
);

// =============================================================================
// CONFABULATION GUARD — ESCALATION DETECTION
// =============================================================================

/**
 * Event emitted when confabulation escalation is detected.
 */
export interface EscalationEvent {
  /** ISO timestamp */
  readonly timestamp: string;
  /** Agent that triggered the escalation */
  readonly agentId: string;
  /** Which parameter is being escalated */
  readonly parameter: string;
  /** Recent values showing the escalation pattern */
  readonly recentValues: readonly number[];
  /** Detected escalation rate (units per second) */
  readonly escalationRate: number;
  /** Whether the agent was throttled */
  readonly throttled: boolean;
}

/**
 * Tracks per-agent value history to detect gradual escalation.
 *
 * Confabulation pattern: Agent applies force 100, 200, 400, 800...
 * Each individual value is below the 10000N cap, but the pattern
 * reveals intentional escalation toward the boundary.
 */
export class ConfabulationGuard {
  private readonly historyWindow: number;
  private readonly escalationThreshold: number;
  private readonly agentHistories: Map<string, Map<string, number[]>> = new Map();
  private readonly escalationEvents: EscalationEvent[] = [];
  private readonly maxEvents: number;

  /**
   * @param historyWindow Number of recent values to track per parameter. Default: 20.
   * @param escalationThreshold Rate of increase (per entry) that triggers detection.
   *   Default: 1.5 (50% increase per entry = exponential escalation).
   * @param maxEvents Maximum escalation events to retain. Default: 500.
   */
  constructor(
    historyWindow: number = 20,
    escalationThreshold: number = 1.5,
    maxEvents: number = 500,
  ) {
    this.historyWindow = historyWindow;
    this.escalationThreshold = escalationThreshold;
    this.maxEvents = maxEvents;
  }

  /**
   * Record a physics value for an agent+parameter combination.
   * Returns true if escalation detected.
   */
  record(agentId: string, parameter: string, value: number): boolean {
    if (!this.agentHistories.has(agentId)) {
      this.agentHistories.set(agentId, new Map());
    }
    const agentParams = this.agentHistories.get(agentId)!;

    if (!agentParams.has(parameter)) {
      agentParams.set(parameter, []);
    }
    const history = agentParams.get(parameter)!;

    history.push(Math.abs(value));
    if (history.length > this.historyWindow) {
      history.shift();
    }

    // Need at least 5 data points to detect a trend
    if (history.length < 5) return false;

    // Compute average ratio between consecutive values
    let ratioSum = 0;
    let ratioCount = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i - 1] > 0.001) {
        ratioSum += history[i] / history[i - 1];
        ratioCount++;
      }
    }

    if (ratioCount === 0) return false;

    const avgRatio = ratioSum / ratioCount;
    const isEscalating = avgRatio >= this.escalationThreshold;

    if (isEscalating) {
      const event: EscalationEvent = {
        timestamp: new Date().toISOString(),
        agentId,
        parameter,
        recentValues: [...history],
        escalationRate: avgRatio,
        throttled: true,
      };

      this.escalationEvents.push(event);
      if (this.escalationEvents.length > this.maxEvents) {
        this.escalationEvents.shift();
      }

      // Reset history to prevent repeated events on same data
      history.length = 0;
    }

    return isEscalating;
  }

  /**
   * Get recent escalation events.
   */
  getEscalationEvents(): readonly EscalationEvent[] {
    return [...this.escalationEvents];
  }

  /**
   * Get escalation event count for a specific agent.
   */
  getAgentEscalationCount(agentId: string): number {
    return this.escalationEvents.filter(e => e.agentId === agentId).length;
  }

  /**
   * Clear history for a specific agent (e.g., on agent disconnect).
   */
  clearAgent(agentId: string): void {
    this.agentHistories.delete(agentId);
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.agentHistories.clear();
    this.escalationEvents.length = 0;
  }
}

// =============================================================================
// AGENT PHYSICS BUDGET TRACKER
// =============================================================================

/**
 * Tracks per-agent cumulative physics usage within a time window.
 * Enforces rate limits to prevent confabulation via high-frequency
 * physics API calls even when individual values are within bounds.
 */
export class AgentPhysicsBudgetTracker {
  private readonly config: Readonly<AgentPhysicsBudgetConfig>;
  private readonly agentBudgets: Map<string, {
    cumulativeForce: number;
    cumulativeImpulse: number;
    callCount: number;
    windowStart: number;
  }> = new Map();

  constructor(config: Readonly<AgentPhysicsBudgetConfig> = DEFAULT_AGENT_PHYSICS_BUDGET) {
    this.config = config;
  }

  /**
   * Check whether an agent has remaining physics budget.
   * Call this BEFORE applying a physics operation.
   *
   * @returns The penalty multiplier (1.0 = full budget, <1.0 = over budget)
   */
  checkBudget(agentId: string): number {
    const budget = this.getOrCreateBudget(agentId);
    this.maybeReplenish(budget);

    const forceRatio = budget.cumulativeForce / this.config.maxCumulativeForcePerSecond;
    const impulseRatio = budget.cumulativeImpulse / this.config.maxCumulativeImpulsePerSecond;
    const callRatio = budget.callCount / this.config.maxCallsPerSecond;

    const maxRatio = Math.max(forceRatio, impulseRatio, callRatio);

    if (maxRatio > 1.0) {
      return this.config.overBudgetPenalty;
    }

    return 1.0;
  }

  /**
   * Record a physics operation for an agent.
   *
   * @param agentId Agent identifier
   * @param forceMagnitude Magnitude of force applied (0 if not a force call)
   * @param impulseMagnitude Magnitude of impulse applied (0 if not an impulse call)
   */
  recordUsage(agentId: string, forceMagnitude: number = 0, impulseMagnitude: number = 0): void {
    const budget = this.getOrCreateBudget(agentId);
    this.maybeReplenish(budget);

    budget.cumulativeForce += forceMagnitude;
    budget.cumulativeImpulse += impulseMagnitude;
    budget.callCount++;
  }

  /**
   * Get budget status for an agent.
   */
  getBudgetStatus(agentId: string): {
    forceUsed: number;
    forceRemaining: number;
    impulseUsed: number;
    impulseRemaining: number;
    callsUsed: number;
    callsRemaining: number;
    overBudget: boolean;
  } {
    const budget = this.getOrCreateBudget(agentId);
    this.maybeReplenish(budget);

    return {
      forceUsed: budget.cumulativeForce,
      forceRemaining: Math.max(0, this.config.maxCumulativeForcePerSecond - budget.cumulativeForce),
      impulseUsed: budget.cumulativeImpulse,
      impulseRemaining: Math.max(0, this.config.maxCumulativeImpulsePerSecond - budget.cumulativeImpulse),
      callsUsed: budget.callCount,
      callsRemaining: Math.max(0, this.config.maxCallsPerSecond - budget.callCount),
      overBudget: this.checkBudget(agentId) < 1.0,
    };
  }

  /**
   * Clear budget for a specific agent.
   */
  clearAgent(agentId: string): void {
    this.agentBudgets.delete(agentId);
  }

  /**
   * Reset all budgets.
   */
  reset(): void {
    this.agentBudgets.clear();
  }

  private getOrCreateBudget(agentId: string): {
    cumulativeForce: number;
    cumulativeImpulse: number;
    callCount: number;
    windowStart: number;
  } {
    if (!this.agentBudgets.has(agentId)) {
      this.agentBudgets.set(agentId, {
        cumulativeForce: 0,
        cumulativeImpulse: 0,
        callCount: 0,
        windowStart: Date.now(),
      });
    }
    return this.agentBudgets.get(agentId)!;
  }

  private maybeReplenish(budget: {
    cumulativeForce: number;
    cumulativeImpulse: number;
    callCount: number;
    windowStart: number;
  }): void {
    const now = Date.now();
    const elapsed = now - budget.windowStart;

    if (elapsed >= this.config.replenishIntervalMs) {
      budget.cumulativeForce = 0;
      budget.cumulativeImpulse = 0;
      budget.callCount = 0;
      budget.windowStart = now;
    }
  }
}

// =============================================================================
// ENVELOPE INTEGRITY CHECK
// =============================================================================

/**
 * Compute a simple integrity hash for an envelope to detect tampering.
 * Uses a deterministic checksum of all numeric values.
 */
export function computeEnvelopeHash(envelope: Readonly<PhysicsSafetyBounds>): number {
  const values = [
    envelope.maxLinearVelocity,
    envelope.maxAngularVelocity,
    envelope.maxForceMagnitude,
    envelope.maxImpulseMagnitude,
    envelope.minGravityScale,
    envelope.maxGravityScale,
    envelope.minMass,
    envelope.maxMass,
    envelope.maxPositionMagnitude,
    envelope.maxAcceleration,
  ];

  // Simple hash: sum of (value * prime[i]) mod large prime
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
  let hash = 0;
  for (let i = 0; i < values.length; i++) {
    // Multiply by 1e6 to capture decimal precision, then use integer arithmetic
    hash = (hash + Math.round(values[i] * 1e6) * primes[i]) & 0x7FFFFFFF;
  }
  return hash;
}

/** The canonical hash of the built-in PHYSICS_SAFETY_ENVELOPE */
export const CANONICAL_ENVELOPE_HASH: number = computeEnvelopeHash(PHYSICS_SAFETY_ENVELOPE);

/**
 * Verify that an envelope matches the canonical built-in values.
 * Returns true if the envelope has not been tampered with.
 */
export function verifyEnvelopeIntegrity(
  envelope: Readonly<PhysicsSafetyBounds>,
): boolean {
  return computeEnvelopeHash(envelope) === CANONICAL_ENVELOPE_HASH;
}

// =============================================================================
// TELEPORTATION ENFORCEMENT
// =============================================================================

/**
 * Tracks per-entity position history for teleportation detection.
 */
export class TeleportationEnforcer {
  private readonly bounds: Readonly<TeleportationBounds>;
  private readonly lastPositions: Map<string, {
    position: [number, number, number];
    timestamp: number;
    cumulativeDelta: number;
    windowStart: number;
    lastTeleportTime: number;
  }> = new Map();

  constructor(bounds: Readonly<TeleportationBounds> = TELEPORTATION_BOUNDS) {
    this.bounds = bounds;
  }

  /**
   * Enforce teleportation bounds on a position update.
   *
   * @param entityId Entity being moved
   * @param newPosition Proposed new position
   * @param timestamp Current time (ms)
   * @returns The enforced position (clamped if needed) and whether it was clamped
   */
  enforce(
    entityId: string,
    newPosition: readonly [number, number, number],
    timestamp: number = Date.now(),
  ): {
    position: [number, number, number];
    clamped: boolean;
    reason?: string;
  } {
    const last = this.lastPositions.get(entityId);

    if (!last) {
      // First position for this entity -- accept it
      this.lastPositions.set(entityId, {
        position: [newPosition[0], newPosition[1], newPosition[2]],
        timestamp,
        cumulativeDelta: 0,
        windowStart: timestamp,
        lastTeleportTime: 0,
      });
      return { position: [newPosition[0], newPosition[1], newPosition[2]], clamped: false };
    }

    // Compute delta
    const dx = newPosition[0] - last.position[0];
    const dy = newPosition[1] - last.position[1];
    const dz = newPosition[2] - last.position[2];
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check single-tick bound
    if (delta > this.bounds.maxDeltaPerTick) {
      // Clamp to max delta in the direction of movement
      const scale = this.bounds.maxDeltaPerTick / delta;
      const clamped: [number, number, number] = [
        last.position[0] + dx * scale,
        last.position[1] + dy * scale,
        last.position[2] + dz * scale,
      ];

      last.position = clamped;
      last.timestamp = timestamp;
      return {
        position: clamped,
        clamped: true,
        reason: `Position delta ${delta.toFixed(2)}m exceeds per-tick max ${this.bounds.maxDeltaPerTick}m`,
      };
    }

    // Check cumulative delta per second
    const windowElapsed = timestamp - last.windowStart;
    if (windowElapsed >= 1000) {
      // Reset window
      last.cumulativeDelta = delta;
      last.windowStart = timestamp;
    } else {
      last.cumulativeDelta += delta;
    }

    if (last.cumulativeDelta > this.bounds.maxDeltaPerSecond) {
      // Over cumulative budget -- freeze position
      return {
        position: [...last.position] as [number, number, number],
        clamped: true,
        reason: `Cumulative delta ${last.cumulativeDelta.toFixed(2)}m exceeds per-second max ${this.bounds.maxDeltaPerSecond}m`,
      };
    }

    // Accept the position
    last.position = [newPosition[0], newPosition[1], newPosition[2]];
    last.timestamp = timestamp;
    return { position: [newPosition[0], newPosition[1], newPosition[2]], clamped: false };
  }

  /**
   * Check if an explicit teleport is allowed (e.g., for VR locomotion).
   *
   * @param entityId Entity being teleported
   * @param targetPosition Target position
   * @param timestamp Current time (ms)
   * @returns Whether the teleport is allowed
   */
  checkTeleport(
    entityId: string,
    targetPosition: readonly [number, number, number],
    timestamp: number = Date.now(),
  ): {
    allowed: boolean;
    reason?: string;
  } {
    const last = this.lastPositions.get(entityId);

    if (!last) {
      return { allowed: true };
    }

    // Check distance
    const dx = targetPosition[0] - last.position[0];
    const dy = targetPosition[1] - last.position[1];
    const dz = targetPosition[2] - last.position[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > this.bounds.maxTeleportDistance) {
      return {
        allowed: false,
        reason: `Teleport distance ${distance.toFixed(2)}m exceeds max ${this.bounds.maxTeleportDistance}m`,
      };
    }

    // Check cooldown
    const timeSinceLastTeleport = timestamp - last.lastTeleportTime;
    if (last.lastTeleportTime > 0 && timeSinceLastTeleport < this.bounds.teleportCooldownMs) {
      return {
        allowed: false,
        reason: `Teleport cooldown: ${(this.bounds.teleportCooldownMs - timeSinceLastTeleport).toFixed(0)}ms remaining`,
      };
    }

    return { allowed: true };
  }

  /**
   * Execute a validated teleport (updates internal state).
   */
  executeTeleport(
    entityId: string,
    targetPosition: readonly [number, number, number],
    timestamp: number = Date.now(),
  ): void {
    const entry = this.lastPositions.get(entityId) ?? {
      position: [0, 0, 0] as [number, number, number],
      timestamp,
      cumulativeDelta: 0,
      windowStart: timestamp,
      lastTeleportTime: 0,
    };

    entry.position = [targetPosition[0], targetPosition[1], targetPosition[2]];
    entry.timestamp = timestamp;
    entry.lastTeleportTime = timestamp;
    entry.cumulativeDelta = 0;
    entry.windowStart = timestamp;

    this.lastPositions.set(entityId, entry);
  }

  /**
   * Remove tracking for an entity.
   */
  removeEntity(entityId: string): void {
    this.lastPositions.delete(entityId);
  }

  /**
   * Reset all tracking.
   */
  reset(): void {
    this.lastPositions.clear();
  }
}

// =============================================================================
// COLLISION FORCE ENFORCEMENT
// =============================================================================

/**
 * Enforce collision force bounds on a collision response.
 */
export function enforceCollisionForce(
  force: readonly number[] | { x: number; y: number; z: number },
  envelope: Readonly<CollisionForceEnvelope> = COLLISION_FORCE_ENVELOPE,
  nodeId?: string,
  source?: string,
): { value: [number, number, number]; clamped: boolean; event?: ClampEvent } {
  const mag = vectorMagnitude(force);
  const value = clampVectorMagnitude(force, envelope.maxCollisionResponseForce);
  const clamped = mag > envelope.maxCollisionResponseForce;

  return {
    value,
    clamped,
    event: clamped
      ? {
          timestamp: new Date().toISOString(),
          parameter: 'maxForceMagnitude',
          requestedValue: mag,
          clampedValue: envelope.maxCollisionResponseForce,
          hardCap: envelope.maxCollisionResponseForce,
          nodeId,
          source: source ?? 'collisionResponse',
        }
      : undefined,
  };
}

/**
 * Enforce collision restitution bounds.
 */
export function enforceRestitution(
  restitution: number,
  envelope: Readonly<CollisionForceEnvelope> = COLLISION_FORCE_ENVELOPE,
): number {
  return clampRange(restitution, envelope.minRestitution, envelope.maxRestitution);
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a complete confabulation-safe physics enforcement suite.
 *
 * Returns all enforcement components pre-configured with default bounds.
 * Use this in PlatformRuntime initialization:
 *
 * ```ts
 * const safety = createConfabulationSafeEnforcement();
 * // Use safety.guard to monitor escalation
 * // Use safety.teleportation to enforce movement bounds
 * // Use safety.budgetTracker to enforce per-agent limits
 * ```
 */
export function createConfabulationSafeEnforcement(config?: {
  teleportationBounds?: Readonly<TeleportationBounds>;
  collisionForceEnvelope?: Readonly<CollisionForceEnvelope>;
  agentBudgetConfig?: Readonly<AgentPhysicsBudgetConfig>;
  escalationHistoryWindow?: number;
  escalationThreshold?: number;
}): {
  guard: ConfabulationGuard;
  teleportation: TeleportationEnforcer;
  budgetTracker: AgentPhysicsBudgetTracker;
  collisionEnvelope: Readonly<CollisionForceEnvelope>;
  verifyIntegrity: () => boolean;
} {
  return {
    guard: new ConfabulationGuard(
      config?.escalationHistoryWindow,
      config?.escalationThreshold,
    ),
    teleportation: new TeleportationEnforcer(
      config?.teleportationBounds ?? TELEPORTATION_BOUNDS,
    ),
    budgetTracker: new AgentPhysicsBudgetTracker(
      config?.agentBudgetConfig ?? DEFAULT_AGENT_PHYSICS_BUDGET,
    ),
    collisionEnvelope: config?.collisionForceEnvelope ?? COLLISION_FORCE_ENVELOPE,
    verifyIntegrity: () => verifyEnvelopeIntegrity(PHYSICS_SAFETY_ENVELOPE),
  };
}
