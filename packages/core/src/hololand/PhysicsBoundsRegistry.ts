/**
 * HoloScript HoloLand — Confabulation-safe physics bounds.
 *
 * Sibling layer to:
 *   - AgentRiskRegistry (`packages/core/src/compiler/identity/AgentRiskRegistry.ts`,
 *     task _penv, commit d5cbaa87f): per-agent confabulation risk score + tier.
 *   - ConfabulationValidator: per-composition schema gate.
 *   - Cross-Validation (HoloLand task _nmcd): multi-agent consensus on world state.
 *
 * This module is the WORLD-SAFETY layer: when an AI-generated agent calls into
 * `PhysicsService` to mutate the running HoloLand simulation (apply force, push
 * an impulse, set velocity, change gravity), we consult the agent's risk tier
 * and clamp the operation to a tier-appropriate envelope before it reaches the
 * underlying simulator.
 *
 * Why this is a separate layer from RBAC + ConfabulationValidator:
 *   - RBAC answers "is this agent allowed to call PhysicsBody.applyForce?" — a
 *     binary yes/no on the *operation*. It cannot reason about the *magnitude*.
 *   - ConfabulationValidator answers "does this composition's TRAIT SCHEMA look
 *     hallucinated?" — a static, compile-time check. It can't see the runtime
 *     stream of `applyForce([1e9, 0, 0])` calls a streaming agent emits.
 *   - AgentRiskRegistry tracks BEHAVIORAL HISTORY but is a passive scorekeeper:
 *     it doesn't itself gate runtime calls. It needs a consumer.
 *
 * PhysicsBoundsRegistry is that consumer. It exposes:
 *
 *   1. A typed `PhysicsBoundsRegistry` class that maps each `RiskTier` to a
 *      `PhysicsEnvelope` (max force, max impulse, max velocity, max angular
 *      velocity, max gravity magnitude, allow-set-gravity bit).
 *   2. A `wrapPhysicsService(service, agentId, registry?, bounds?)` decorator
 *      that returns a drop-in `PhysicsService` whose `PhysicsBody` instances
 *      enforce the envelope: out-of-range values are CLAMPED, not silently
 *      passed through, and a `BoundsViolation` event is emitted via callback.
 *   3. QUARANTINED agents have all dynamic mutations rejected (no-op) — they
 *      can still create static bodies and read state. This matches the gate
 *      contract from `AgentRBAC.checkAccessWithRiskGate()` for `transform`
 *      operations.
 *
 * Design contract (matches sibling shape from AgentRiskRegistry):
 *   1. Typed surface — `PhysicsEnvelope`, `RiskTier` mapping, `BoundsViolation`.
 *   2. Working pipeline — wrap an existing `PhysicsService`, route mutations
 *      through clamp logic, emit violations.
 *   3. Tests — envelope clamping per tier + QUARANTINED rejection +
 *      composition with `AgentRiskRegistry` singleton.
 *   4. No gold-plating — no per-body overrides, no policy DSL, no telemetry
 *      backend, no Loro CRDT sync. Those land when downstream consumers need
 *      them.
 *
 * @version 1.0.0
 * @module @holoscript/core/hololand/PhysicsBoundsRegistry
 */

import {
  AgentRiskRegistry,
  RiskTier,
  getAgentRiskRegistry,
} from '../compiler/identity/AgentRiskRegistry';
import type {
  PhysicsService,
  PhysicsBody,
  RigidBodyConfig,
  ColliderShape,
  RaycastResult,
} from './HololandIntegration';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Per-tier physics operation envelope.
 *
 * All magnitude limits are scalar bounds on the L2 norm of the input vector.
 * For example, `maxForceN = 100` means `applyForce([f.x, f.y, f.z])` will be
 * clamped so that `sqrt(fx^2 + fy^2 + fz^2) <= 100` (preserving direction).
 *
 * Units:
 *   - force: Newtons (N)
 *   - impulse: Newton-seconds (N·s)
 *   - velocity: meters per second (m/s)
 *   - gravity: meters per second squared (m/s^2)
 */
export interface PhysicsEnvelope {
  /** Maximum L2 norm of `applyForce(force)` input. */
  maxForceN: number;
  /** Maximum L2 norm of `applyImpulse(impulse)` input. */
  maxImpulseNs: number;
  /** Maximum L2 norm of `setVelocity(v)` input. */
  maxVelocityMps: number;
  /** Maximum L2 norm of `setGravity(g)` input. */
  maxGravityMps2: number;
  /**
   * Whether the agent is allowed to call `setGravity` at all.
   * High-risk and quarantined agents can't reshape the global force field.
   */
  allowSetGravity: boolean;
  /**
   * Whether the agent is allowed to perform any dynamic mutation
   * (`applyForce`, `applyImpulse`, `setVelocity`, `setPosition`, `setRotation`).
   * QUARANTINED agents have this set to false; their calls become no-ops and
   * emit a `BoundsViolation` with `kind: 'rejected'`.
   */
  allowDynamicMutation: boolean;
}

/**
 * The shape of a bounds violation event emitted to the optional callback.
 *
 * `kind: 'clamped'` — value was reduced to fit the envelope; the operation
 *                     proceeded with the clamped value.
 * `kind: 'rejected'` — operation was refused (agent is QUARANTINED, or
 *                      `setGravity` called when `allowSetGravity = false`);
 *                      no underlying call was made.
 */
export interface BoundsViolation {
  agentId: string;
  tier: RiskTier;
  kind: 'clamped' | 'rejected';
  /** Which physics op tripped the gate. */
  operation:
    | 'applyForce'
    | 'applyImpulse'
    | 'setVelocity'
    | 'setGravity'
    | 'setPosition'
    | 'setRotation';
  /** Magnitude of the original input (L2 norm). */
  requestedMagnitude: number;
  /** Envelope cap for this op. */
  allowedMagnitude: number;
  /** Body id, when relevant. `null` for service-level ops like `setGravity`. */
  bodyId: string | null;
}

/**
 * Configuration for `PhysicsBoundsRegistry`.
 */
export interface PhysicsBoundsRegistryConfig {
  /**
   * Override the envelope for one or more tiers. Any tier not specified uses
   * the default envelope.
   */
  envelopeOverrides?: Partial<Record<RiskTier, Partial<PhysicsEnvelope>>>;
}

// =============================================================================
// DEFAULT ENVELOPES
// =============================================================================

/**
 * Default per-tier physics envelopes.
 *
 * Magnitudes chosen to match a typical room-scale VR experience:
 *   - LOW: realistic upper bound for a human-driven push (a few hundred N).
 *   - MEDIUM: half of LOW — agent is suspect, give it less authority.
 *   - HIGH: a quarter of MEDIUM — agent must produce small, plausible motion.
 *   - QUARANTINED: zero — agent cannot mutate the simulation at all.
 *
 * These are deliberately conservative for VR safety (motion sickness, physical
 * harm in mixed-reality). Downstream apps with looser needs can override via
 * `PhysicsBoundsRegistryConfig.envelopeOverrides`.
 */
export const DEFAULT_ENVELOPES: Readonly<Record<RiskTier, PhysicsEnvelope>> = {
  [RiskTier.LOW]: {
    maxForceN: 1000,
    maxImpulseNs: 200,
    maxVelocityMps: 50,
    maxGravityMps2: 30,
    allowSetGravity: true,
    allowDynamicMutation: true,
  },
  [RiskTier.MEDIUM]: {
    maxForceN: 500,
    maxImpulseNs: 100,
    maxVelocityMps: 20,
    maxGravityMps2: 15,
    allowSetGravity: true,
    allowDynamicMutation: true,
  },
  [RiskTier.HIGH]: {
    maxForceN: 100,
    maxImpulseNs: 25,
    maxVelocityMps: 5,
    maxGravityMps2: 10,
    // High-risk agents can't reshape gravity — that's a global effect that
    // would propagate confabulation risk to every body in the world.
    allowSetGravity: false,
    allowDynamicMutation: true,
  },
  [RiskTier.QUARANTINED]: {
    maxForceN: 0,
    maxImpulseNs: 0,
    maxVelocityMps: 0,
    maxGravityMps2: 0,
    allowSetGravity: false,
    allowDynamicMutation: false,
  },
};

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * Confabulation-safe physics envelope registry.
 *
 * Stateless w.r.t. agent history (delegates to `AgentRiskRegistry`).
 * Holds only the envelope table.
 */
export class PhysicsBoundsRegistry {
  private readonly envelopes: Readonly<Record<RiskTier, PhysicsEnvelope>>;

  constructor(config: PhysicsBoundsRegistryConfig = {}) {
    const overrides = config.envelopeOverrides ?? {};
    const merged: Record<RiskTier, PhysicsEnvelope> = {
      [RiskTier.LOW]: { ...DEFAULT_ENVELOPES[RiskTier.LOW] },
      [RiskTier.MEDIUM]: { ...DEFAULT_ENVELOPES[RiskTier.MEDIUM] },
      [RiskTier.HIGH]: { ...DEFAULT_ENVELOPES[RiskTier.HIGH] },
      [RiskTier.QUARANTINED]: { ...DEFAULT_ENVELOPES[RiskTier.QUARANTINED] },
    };
    for (const tier of Object.keys(overrides) as RiskTier[]) {
      const partial = overrides[tier];
      if (!partial) continue;
      merged[tier] = { ...merged[tier], ...partial };
    }
    this.envelopes = merged;
  }

  /**
   * Look up the envelope for a risk tier (read-only view).
   */
  getEnvelope(tier: RiskTier): PhysicsEnvelope {
    return { ...this.envelopes[tier] };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let globalBoundsRegistry: PhysicsBoundsRegistry | null = null;

/**
 * Get or create the global `PhysicsBoundsRegistry`.
 */
export function getPhysicsBoundsRegistry(
  config?: PhysicsBoundsRegistryConfig
): PhysicsBoundsRegistry {
  if (!globalBoundsRegistry) {
    globalBoundsRegistry = new PhysicsBoundsRegistry(config);
  }
  return globalBoundsRegistry;
}

/**
 * Reset the global bounds registry (for testing).
 */
export function resetPhysicsBoundsRegistry(): void {
  globalBoundsRegistry = null;
}

// =============================================================================
// PHYSICS SERVICE WRAPPER
// =============================================================================

/**
 * Options for `wrapPhysicsService`.
 */
export interface WrapOptions {
  /**
   * Risk source: defaults to the global `AgentRiskRegistry` singleton.
   */
  riskRegistry?: AgentRiskRegistry;
  /**
   * Bounds source: defaults to the global `PhysicsBoundsRegistry` singleton.
   */
  boundsRegistry?: PhysicsBoundsRegistry;
  /**
   * Optional callback fired on every clamp or rejection. Useful for telemetry,
   * audit logging, and surfacing UX warnings.
   */
  onViolation?: (violation: BoundsViolation) => void;
}

/**
 * Wrap a `PhysicsService` so all dynamic mutations are gated by the agent's
 * confabulation risk tier.
 *
 * Returns a NEW `PhysicsService` that delegates to the underlying service
 * after enforcing per-tier envelopes. The original service is unchanged.
 *
 * Composition (NOT fork) — the wrapper holds a reference to the underlying
 * service and forwards reads + clean writes verbatim. Only mutating ops
 * with magnitude inputs are intercepted.
 */
export function wrapPhysicsService(
  service: PhysicsService,
  agentId: string,
  options: WrapOptions = {}
): PhysicsService {
  const riskRegistry = options.riskRegistry ?? getAgentRiskRegistry();
  const boundsRegistry = options.boundsRegistry ?? getPhysicsBoundsRegistry();
  const onViolation = options.onViolation;

  function currentEnvelope(): { tier: RiskTier; env: PhysicsEnvelope } {
    const tier = riskRegistry.getTier(agentId);
    return { tier, env: boundsRegistry.getEnvelope(tier) };
  }

  function emit(v: BoundsViolation): void {
    if (onViolation) {
      try {
        onViolation(v);
      } catch {
        // A misbehaving callback must never break physics.
      }
    }
  }

  function wrapBody(body: PhysicsBody): PhysicsBody {
    return {
      get id() {
        return body.id;
      },

      setPosition(position: [number, number, number]): void {
        const { tier, env } = currentEnvelope();
        if (!env.allowDynamicMutation) {
          emit({
            agentId,
            tier,
            kind: 'rejected',
            operation: 'setPosition',
            requestedMagnitude: vectorMagnitude(position),
            allowedMagnitude: 0,
            bodyId: body.id,
          });
          return;
        }
        body.setPosition(position);
      },

      setRotation(rotation: { x: number; y: number; z: number; w: number }): void {
        const { tier, env } = currentEnvelope();
        if (!env.allowDynamicMutation) {
          emit({
            agentId,
            tier,
            kind: 'rejected',
            operation: 'setRotation',
            requestedMagnitude: 0,
            allowedMagnitude: 0,
            bodyId: body.id,
          });
          return;
        }
        body.setRotation(rotation);
      },

      setVelocity(velocity: [number, number, number]): void {
        const { tier, env } = currentEnvelope();
        if (!env.allowDynamicMutation) {
          emit({
            agentId,
            tier,
            kind: 'rejected',
            operation: 'setVelocity',
            requestedMagnitude: vectorMagnitude(velocity),
            allowedMagnitude: 0,
            bodyId: body.id,
          });
          return;
        }
        const { value, clamped, requested } = clampVector(velocity, env.maxVelocityMps);
        if (clamped) {
          emit({
            agentId,
            tier,
            kind: 'clamped',
            operation: 'setVelocity',
            requestedMagnitude: requested,
            allowedMagnitude: env.maxVelocityMps,
            bodyId: body.id,
          });
        }
        body.setVelocity(value);
      },

      applyForce(force: [number, number, number]): void {
        const { tier, env } = currentEnvelope();
        if (!env.allowDynamicMutation) {
          emit({
            agentId,
            tier,
            kind: 'rejected',
            operation: 'applyForce',
            requestedMagnitude: vectorMagnitude(force),
            allowedMagnitude: 0,
            bodyId: body.id,
          });
          return;
        }
        const { value, clamped, requested } = clampVector(force, env.maxForceN);
        if (clamped) {
          emit({
            agentId,
            tier,
            kind: 'clamped',
            operation: 'applyForce',
            requestedMagnitude: requested,
            allowedMagnitude: env.maxForceN,
            bodyId: body.id,
          });
        }
        body.applyForce(value);
      },

      applyImpulse(impulse: [number, number, number]): void {
        const { tier, env } = currentEnvelope();
        if (!env.allowDynamicMutation) {
          emit({
            agentId,
            tier,
            kind: 'rejected',
            operation: 'applyImpulse',
            requestedMagnitude: vectorMagnitude(impulse),
            allowedMagnitude: 0,
            bodyId: body.id,
          });
          return;
        }
        const { value, clamped, requested } = clampVector(impulse, env.maxImpulseNs);
        if (clamped) {
          emit({
            agentId,
            tier,
            kind: 'clamped',
            operation: 'applyImpulse',
            requestedMagnitude: requested,
            allowedMagnitude: env.maxImpulseNs,
            bodyId: body.id,
          });
        }
        body.applyImpulse(value);
      },

      // Reads pass through unchanged — confabulation doesn't propagate via
      // queries.
      getPosition(): [number, number, number] {
        return body.getPosition();
      },
      getVelocity(): [number, number, number] {
        return body.getVelocity();
      },
      destroy(): void {
        body.destroy();
      },
    };
  }

  return {
    createBody(config: RigidBodyConfig): PhysicsBody {
      // Body creation itself is not magnitude-bound — RBAC handles the
      // "may this agent create static/dynamic/kinematic bodies?" decision.
      // We only wrap the returned body so subsequent mutations are gated.
      const body = service.createBody(config);
      return wrapBody(body);
    },

    raycast(
      origin: [number, number, number],
      direction: [number, number, number],
      maxDistance: number
    ): RaycastResult | null {
      // Reads pass through; no envelope applies.
      const result = service.raycast(origin, direction, maxDistance);
      if (!result) return null;
      return { ...result, body: wrapBody(result.body) };
    },

    overlap(shape: ColliderShape, position: [number, number, number]): PhysicsBody[] {
      return service.overlap(shape, position).map(wrapBody);
    },

    setGravity(gravity: [number, number, number]): void {
      const { tier, env } = currentEnvelope();
      const requested = vectorMagnitude(gravity);
      if (!env.allowSetGravity) {
        emit({
          agentId,
          tier,
          kind: 'rejected',
          operation: 'setGravity',
          requestedMagnitude: requested,
          allowedMagnitude: 0,
          bodyId: null,
        });
        return;
      }
      const { value, clamped } = clampVector(gravity, env.maxGravityMps2);
      if (clamped) {
        emit({
          agentId,
          tier,
          kind: 'clamped',
          operation: 'setGravity',
          requestedMagnitude: requested,
          allowedMagnitude: env.maxGravityMps2,
          bodyId: null,
        });
      }
      service.setGravity(value);
    },

    step(deltaTime: number): void {
      // Stepping the simulation isn't agent-magnitude-bound; HoloLand owns
      // the simulation cadence.
      service.step(deltaTime);
    },
  };
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * L2 norm of a 3D vector.
 */
function vectorMagnitude(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Clamp a vector's L2 norm to `maxMagnitude`, preserving direction.
 *
 * If `maxMagnitude <= 0` the vector is replaced with the zero vector — that
 * matches the QUARANTINED semantics, although QUARANTINED is normally caught
 * earlier by `allowDynamicMutation = false`.
 *
 * Returns the (possibly) clamped vector along with a `clamped` bit and the
 * original `requested` magnitude for telemetry.
 */
function clampVector(
  v: [number, number, number],
  maxMagnitude: number
): {
  value: [number, number, number];
  clamped: boolean;
  requested: number;
} {
  const requested = vectorMagnitude(v);
  if (maxMagnitude <= 0) {
    return { value: [0, 0, 0], clamped: requested > 0, requested };
  }
  if (requested <= maxMagnitude) {
    return { value: [v[0], v[1], v[2]], clamped: false, requested };
  }
  // Avoid divide-by-zero — if requested > 0 we already passed the early exit
  // for == 0 via `requested <= maxMagnitude`.
  const scale = maxMagnitude / requested;
  return {
    value: [v[0] * scale, v[1] * scale, v[2] * scale],
    clamped: true,
    requested,
  };
}
