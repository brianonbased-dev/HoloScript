/**
 * HoloScript Agent Risk Registry — per-agent confabulation risk scoring.
 *
 * Sibling layer to:
 *   - PhysicsBounds (HoloLand task _ypw8): hard caps on AI-generated values
 *   - Cross-Validation (HoloLand task _nmcd): multi-agent consensus on world state
 *
 * This module is the AGENT-IDENTITY layer of the Confabulation Risk story.
 * `ConfabulationValidator` already validates a single composition's TRAIT
 * SCHEMAS at compile time. This registry tracks the BEHAVIORAL HISTORY of the
 * AGENT that produced those compositions and gates dangerous operations
 * differently based on accumulated risk.
 *
 * Why this is a separate layer:
 *   - A schema-clean composition from an agent that has confabulated 50 times
 *     in the last hour is still suspect — it may have learned to dodge the
 *     schema gate while still hallucinating cross-trait semantics.
 *   - A schema-dirty composition from a brand-new agent on its first run is
 *     less alarming — it may just be miscalibrated and need feedback.
 *   - RBAC currently treats all authenticated agents equally for any op they
 *     have permission for. That's wrong when the agent is AI-generated
 *     content: dangerous ops (write OUTPUT, transform IR) need a stricter
 *     gate when the agent has a history of producing confabulated traits.
 *
 * Design contract (matches sibling shape from prophetic-GI / X402 commits):
 *   1. Typed surface — `AgentRiskRegistry`, `RiskTier`, `RiskEvent`.
 *   2. Working pipeline — record events from `ConfabulationValidationResult`,
 *      compute decayed score, classify into tier, gate access decisions.
 *   3. Tests — registry behavior + AgentRBAC integration.
 *   4. No gold-plating — no persistence backend, no remote sync, no policy
 *      DSL. Those land when downstream consumers need them.
 *
 * @version 1.0.0
 * @module @holoscript/core/compiler/identity/AgentRiskRegistry
 */

import type {
  ConfabulationValidationResult,
  ConfabulationError,
} from './ConfabulationValidator';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Risk tier classification for an agent. Each tier maps to a different gate
 * policy in `AgentRBAC.checkAccessWithRiskGate()`.
 */
export enum RiskTier {
  /** No history of confabulation — full default access. */
  LOW = 'low',
  /** Some confabulation history — composition risk threshold tightened. */
  MEDIUM = 'medium',
  /** Frequent confabulation — dangerous ops require near-zero composition risk. */
  HIGH = 'high',
  /** Quarantined — dangerous ops blocked regardless of composition validity. */
  QUARANTINED = 'quarantined',
}

/**
 * A recorded risk event for an agent.
 *
 * Events accrue when an agent produces a composition that fails confabulation
 * validation, and decay over time when an agent produces clean compositions.
 */
export interface RiskEvent {
  /** Agent identity (the JWT `sub` claim, e.g. `agent:syntax_analyzer:syntax-v1`). */
  agentId: string;
  /** Severity of this event (0-100). Maps to the originating composition's risk score. */
  severity: number;
  /** Human-readable label for diagnostics. */
  reason: string;
  /** Unix timestamp (ms) the event was recorded. */
  timestamp: number;
}

/**
 * Snapshot of an agent's current risk state.
 */
export interface AgentRiskSnapshot {
  agentId: string;
  /** Current decayed score, 0-100. */
  score: number;
  tier: RiskTier;
  /** Number of recorded events still inside the decay window. */
  recentEventCount: number;
  /** Total events ever recorded (lifetime, not decayed). */
  lifetimeEventCount: number;
  /** Total successful (clean) operations recorded (lifetime). */
  lifetimeSuccessCount: number;
  /** Timestamp of the last recorded event (ms), or null if none. */
  lastEventAt: number | null;
}

/**
 * Configuration for `AgentRiskRegistry`.
 */
export interface AgentRiskRegistryConfig {
  /**
   * Half-life of a risk event in milliseconds. After this many ms a single
   * event contributes half its severity. Default: 1 hour.
   */
  halfLifeMs?: number;

  /**
   * Score thresholds that map to tier classifications.
   * Default: low <15, medium <40, high <75, quarantined >=75.
   */
  tierThresholds?: {
    medium: number;
    high: number;
    quarantined: number;
  };

  /**
   * Severity granted to a clean operation, subtracted from the running score
   * (after decay). Default: 5. Set to 0 to disable success-based decay
   * beyond time-based decay.
   */
  successCreditPerOp?: number;

  /**
   * Maximum number of events kept per agent (oldest discarded). Default: 256.
   */
  maxEventsPerAgent?: number;

  /**
   * Override the time source. Useful for tests. Default: `Date.now`.
   */
  now?: () => number;
}

/** Default tier thresholds. */
const DEFAULT_THRESHOLDS = {
  medium: 15,
  high: 40,
  quarantined: 75,
} as const;

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * Per-agent confabulation risk registry.
 *
 * Stateful: holds an in-memory map of agent IDs to event histories. The
 * registry is process-local; multi-process deployments should layer their
 * own consensus (this module deliberately does not depend on storage).
 */
export class AgentRiskRegistry {
  private readonly halfLifeMs: number;
  private readonly tierThresholds: { medium: number; high: number; quarantined: number };
  private readonly successCreditPerOp: number;
  private readonly maxEventsPerAgent: number;
  private readonly now: () => number;

  /** agentId -> ring of recent events (oldest first). */
  private readonly events: Map<string, RiskEvent[]> = new Map();

  /** Lifetime counters (not decayed). */
  private readonly lifetimeEvents: Map<string, number> = new Map();
  private readonly lifetimeSuccesses: Map<string, number> = new Map();

  constructor(config: AgentRiskRegistryConfig = {}) {
    this.halfLifeMs = config.halfLifeMs ?? 60 * 60 * 1000;
    this.tierThresholds = {
      medium: config.tierThresholds?.medium ?? DEFAULT_THRESHOLDS.medium,
      high: config.tierThresholds?.high ?? DEFAULT_THRESHOLDS.high,
      quarantined: config.tierThresholds?.quarantined ?? DEFAULT_THRESHOLDS.quarantined,
    };
    this.successCreditPerOp = config.successCreditPerOp ?? 5;
    this.maxEventsPerAgent = config.maxEventsPerAgent ?? 256;
    this.now = config.now ?? (() => Date.now());

    if (this.tierThresholds.medium >= this.tierThresholds.high) {
      throw new Error('AgentRiskRegistry: tierThresholds.medium must be < high');
    }
    if (this.tierThresholds.high >= this.tierThresholds.quarantined) {
      throw new Error('AgentRiskRegistry: tierThresholds.high must be < quarantined');
    }
    if (this.halfLifeMs <= 0) {
      throw new Error('AgentRiskRegistry: halfLifeMs must be > 0');
    }
  }

  /**
   * Record a confabulation event from a `ConfabulationValidationResult`.
   *
   * Severity is taken from the result's `riskScore`. If the result is `valid`
   * (no errors) this records a *success*, not a confabulation event — clean
   * passes lower the agent's running score.
   */
  recordValidation(agentId: string, result: ConfabulationValidationResult): void {
    if (result.valid && result.errors.length === 0) {
      this.recordSuccess(agentId);
      return;
    }
    // Use the validator's own riskScore as severity; cap at 100.
    const severity = Math.max(1, Math.min(100, Math.round(result.riskScore)));
    const reason = this.summarizeErrors(result.errors);
    this.recordEvent({
      agentId,
      severity,
      reason,
      timestamp: this.now(),
    });
  }

  /**
   * Record a custom risk event (e.g. from a downstream consumer that detected
   * confabulation outside the standard validator path).
   */
  recordEvent(event: RiskEvent): void {
    const ring = this.events.get(event.agentId) ?? [];
    ring.push(event);
    if (ring.length > this.maxEventsPerAgent) {
      ring.shift();
    }
    this.events.set(event.agentId, ring);
    this.lifetimeEvents.set(
      event.agentId,
      (this.lifetimeEvents.get(event.agentId) ?? 0) + 1
    );
  }

  /**
   * Record a successful (clean) operation. Reduces the agent's accrued score
   * by `successCreditPerOp` (post-decay, floored at 0).
   *
   * Implemented as a synthetic *negative* event so that decay still applies:
   * we push a sentinel with negative severity. `getScore` clamps to >=0.
   */
  recordSuccess(agentId: string): void {
    if (this.successCreditPerOp <= 0) {
      this.lifetimeSuccesses.set(
        agentId,
        (this.lifetimeSuccesses.get(agentId) ?? 0) + 1
      );
      return;
    }
    const ring = this.events.get(agentId) ?? [];
    ring.push({
      agentId,
      severity: -this.successCreditPerOp,
      reason: 'clean-validation',
      timestamp: this.now(),
    });
    if (ring.length > this.maxEventsPerAgent) {
      ring.shift();
    }
    this.events.set(agentId, ring);
    this.lifetimeSuccesses.set(
      agentId,
      (this.lifetimeSuccesses.get(agentId) ?? 0) + 1
    );
  }

  /**
   * Compute the current decayed risk score for an agent (0-100).
   *
   * Each event contributes `severity * 0.5 ^ (age / halfLifeMs)`. Negative
   * (success) events reduce the running total. Final score is clamped to
   * [0, 100].
   */
  getScore(agentId: string): number {
    const ring = this.events.get(agentId);
    if (!ring || ring.length === 0) return 0;
    const now = this.now();
    let score = 0;
    for (const ev of ring) {
      const ageMs = Math.max(0, now - ev.timestamp);
      const decay = Math.pow(0.5, ageMs / this.halfLifeMs);
      score += ev.severity * decay;
    }
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Classify an agent into a `RiskTier`. Pure function of `getScore`.
   */
  getTier(agentId: string): RiskTier {
    const score = this.getScore(agentId);
    if (score >= this.tierThresholds.quarantined) return RiskTier.QUARANTINED;
    if (score >= this.tierThresholds.high) return RiskTier.HIGH;
    if (score >= this.tierThresholds.medium) return RiskTier.MEDIUM;
    return RiskTier.LOW;
  }

  /**
   * Snapshot of an agent's current state (for diagnostics / dashboards).
   */
  getSnapshot(agentId: string): AgentRiskSnapshot {
    const ring = this.events.get(agentId) ?? [];
    const positiveEvents = ring.filter((e) => e.severity > 0);
    const lastPositive = positiveEvents[positiveEvents.length - 1];
    return {
      agentId,
      score: this.getScore(agentId),
      tier: this.getTier(agentId),
      recentEventCount: positiveEvents.length,
      lifetimeEventCount: this.lifetimeEvents.get(agentId) ?? 0,
      lifetimeSuccessCount: this.lifetimeSuccesses.get(agentId) ?? 0,
      lastEventAt: lastPositive ? lastPositive.timestamp : null,
    };
  }

  /**
   * Force-set an agent's tier by clearing history and inserting a calibration
   * event. Used by orchestrators to quarantine a known-bad agent or to
   * reinstate a rehabilitated one.
   *
   * Note: this is an *administrative* operation, not a normal flow. The
   * caller is responsible for authorization.
   *
   * The inserted event is severity = midpoint of the requested tier band
   * so that small amounts of decay between `setTier` and the next read
   * don't bump the agent into a lower tier.
   */
  setTier(agentId: string, tier: RiskTier): void {
    this.events.delete(agentId);
    if (tier === RiskTier.LOW) {
      // No event needed; absent agents are LOW by default.
      return;
    }
    // Pick severity in the MIDDLE of the requested tier band — robust to
    // small decay between set-time and read-time.
    let severity: number;
    switch (tier) {
      case RiskTier.MEDIUM:
        severity = (this.tierThresholds.medium + this.tierThresholds.high) / 2;
        break;
      case RiskTier.HIGH:
        severity = (this.tierThresholds.high + this.tierThresholds.quarantined) / 2;
        break;
      case RiskTier.QUARANTINED:
        // Above quarantine threshold by a comfortable margin (clamped at 100).
        severity = Math.min(100, this.tierThresholds.quarantined + 10);
        break;
    }
    this.recordEvent({
      agentId,
      severity,
      reason: `administrative:set-tier:${tier}`,
      timestamp: this.now(),
    });
  }

  /**
   * Clear all history for an agent. Resets to LOW tier.
   */
  clear(agentId: string): void {
    this.events.delete(agentId);
    this.lifetimeEvents.delete(agentId);
    this.lifetimeSuccesses.delete(agentId);
  }

  /**
   * Clear all state in the registry. Useful for tests.
   */
  clearAll(): void {
    this.events.clear();
    this.lifetimeEvents.clear();
    this.lifetimeSuccesses.clear();
  }

  /**
   * List all agents currently tracked (have at least one event).
   */
  listAgents(): string[] {
    return Array.from(this.events.keys());
  }

  /**
   * Configured tier thresholds (read-only view).
   */
  getThresholds(): { medium: number; high: number; quarantined: number } {
    return { ...this.tierThresholds };
  }

  /**
   * Configured half-life in ms (read-only).
   */
  getHalfLifeMs(): number {
    return this.halfLifeMs;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private summarizeErrors(errors: ConfabulationError[]): string {
    if (errors.length === 0) return 'no-errors';
    if (errors.length === 1) return errors[0].code;
    return `${errors[0].code}+${errors.length - 1}-more`;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let globalRegistry: AgentRiskRegistry | null = null;

/**
 * Get or create the global `AgentRiskRegistry` instance.
 *
 * AgentRBAC.checkAccessWithRiskGate() consults this singleton by default.
 */
export function getAgentRiskRegistry(config?: AgentRiskRegistryConfig): AgentRiskRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRiskRegistry(config);
  }
  return globalRegistry;
}

/**
 * Reset the global registry (for testing).
 */
export function resetAgentRiskRegistry(): void {
  globalRegistry = null;
}

// =============================================================================
// GATE POLICY (consumed by AgentRBAC)
// =============================================================================

/**
 * Resource-operation pairs treated as "dangerous" by the risk gate.
 *
 * A dangerous op writes/transforms compiler output that downstream agents or
 * humans will consume. Reads are not dangerous because they don't propagate
 * confabulation. This list intentionally mirrors the WRITE/TRANSFORM/EXECUTE
 * permissions in `AgentPermission`.
 */
export const DANGEROUS_OPERATIONS: ReadonlyArray<'write' | 'transform' | 'execute'> = [
  'write',
  'transform',
  'execute',
];

/**
 * Maximum allowed composition risk score (from `ConfabulationValidator`) for
 * each agent risk tier when performing a dangerous operation.
 *
 * - LOW: full default — composition can use the validator's own threshold.
 * - MEDIUM: composition must be cleaner than the validator default.
 * - HIGH: composition must be near-pristine.
 * - QUARANTINED: dangerous ops blocked regardless of composition.
 */
export const TIER_COMPOSITION_RISK_CAP: Readonly<Record<RiskTier, number>> = {
  [RiskTier.LOW]: 50,
  [RiskTier.MEDIUM]: 25,
  [RiskTier.HIGH]: 10,
  [RiskTier.QUARANTINED]: -1, // sentinel: any composition denied
};

/**
 * Returns true if the (resource, operation) pair counts as a dangerous op
 * that the risk gate should attenuate.
 */
export function isDangerousOperation(
  operation: 'read' | 'write' | 'execute' | 'transform'
): boolean {
  return DANGEROUS_OPERATIONS.includes(operation as 'write' | 'transform' | 'execute');
}
